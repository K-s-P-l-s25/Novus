// M3 acceptance check against the real Supabase project (SPEC §8.2):
//   1. a password-only (aal1) session cannot read or write sync_records / user_keys;
//   2. after TOTP (aal2) the same user can write and read only their own rows;
//   3. another user's rows are invisible and cannot be written.
// Uses ONLY the throwaway test user. It enrols TOTP for that user and computes codes itself.
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_PUBLISHABLE_KEY=sb_publishable_... \
//   TEST_EMAIL=rls-test@... TEST_PASSWORD='...' [TEST_TOTP_SECRET=...] node scripts/supabase-rls-check.mjs
import { createClient } from "@supabase/supabase-js";
import { Buffer } from "node:buffer";
import { createHmac, randomUUID } from "node:crypto";

const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, TEST_EMAIL, TEST_PASSWORD } = process.env;
let totpSecret = process.env.TEST_TOTP_SECRET;
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !TEST_EMAIL || !TEST_PASSWORD) {
  console.error(
    "Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, TEST_EMAIL and TEST_PASSWORD (throwaway user).",
  );
  process.exit(2);
}

const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

function base32Decode(s) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const out = [];
  for (const c of s.replace(/=+$/, "").toUpperCase()) {
    value = (value << 5) | alphabet.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** RFC 6238 TOTP (SHA-1, 30 s, 6 digits), as Proton Authenticator computes it. */
function totp(secret, at = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const h = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, "0");
}

const probe = (userId) => ({
  ...(userId ? { user_id: userId } : {}),
  entity: "rls_probe",
  id: randomUUID(),
  hlc: `${String(Date.now()).padStart(13, "0")}-00000-rlscheck`,
  deleted: false,
  payload_v: 1,
  payload: Buffer.from("not-a-real-ciphertext").toString("base64"),
});

// ── 1. password only → aal1 ──
const { data: signIn, error: signInErr } = await sb.auth.signInWithPassword({
  email: TEST_EMAIL,
  password: TEST_PASSWORD,
});
if (signInErr) {
  console.error("sign-in failed:", signInErr.message);
  process.exit(1);
}
const me = signIn.user.id;
const aal1 = (await sb.auth.mfa.getAuthenticatorAssuranceLevel()).data;
check(
  "password-only session is aal1",
  aal1?.currentLevel === "aal1",
  `current=${aal1?.currentLevel}`,
);
{
  const sel = await sb.from("sync_records").select("id").limit(5);
  check(
    "aal1: sync_records select returns no rows",
    !sel.error && sel.data.length === 0,
    sel.error?.message ?? `${sel.data.length} rows`,
  );
  const keys = await sb.from("user_keys").select("user_id").limit(1);
  check(
    "aal1: user_keys select returns no rows",
    !keys.error && keys.data.length === 0,
    keys.error?.message ?? `${keys.data.length} rows`,
  );
  const ins = await sb.from("sync_records").insert(probe());
  check("aal1: direct insert rejected", Boolean(ins.error), ins.error?.code ?? "INSERTED");
  const rpc = await sb.rpc("sync_push", { rows: [probe()] });
  check("aal1: sync_push rejected", Boolean(rpc.error), rpc.error?.code ?? "ACCEPTED");
}

// ── 2. TOTP → aal2 ──
const { data: factors } = await sb.auth.mfa.listFactors();
let factorId = factors?.totp?.[0]?.id;
if (!factorId) {
  for (const f of factors?.all ?? [])
    if (f.status === "unverified") await sb.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await sb.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "rls-check",
  });
  if (error) {
    console.error("enrol failed:", error.message);
    process.exit(1);
  }
  factorId = data.id;
  totpSecret = data.totp.secret;
  console.log(
    `(enrolled TOTP for the throwaway user; to re-run later set TEST_TOTP_SECRET=${totpSecret})`,
  );
} else if (!totpSecret) {
  console.error(
    "The test user already has a TOTP factor. Set TEST_TOTP_SECRET (printed on the first run) or recreate the user.",
  );
  process.exit(2);
}
const { error: vErr } = await sb.auth.mfa.challengeAndVerify({ factorId, code: totp(totpSecret) });
check("TOTP verification succeeds", !vErr, vErr?.message ?? "");
const aal2 = (await sb.auth.mfa.getAuthenticatorAssuranceLevel()).data;
check("session is aal2 after TOTP", aal2?.currentLevel === "aal2", `current=${aal2?.currentLevel}`);

if (aal2?.currentLevel === "aal2") {
  const own = probe();
  const rpc = await sb.rpc("sync_push", { rows: [own] });
  check(
    "aal2: sync_push accepted for own row",
    !rpc.error && rpc.data?.[0]?.out_accepted === true,
    rpc.error?.message ?? "",
  );
  const mine = await sb.from("sync_records").select("id,user_id").eq("id", own.id);
  check(
    "aal2: own row readable",
    !mine.error && mine.data.length === 1,
    mine.error?.message ?? `${mine.data.length} rows`,
  );

  // ── 3. other users ──
  const others = await sb.from("sync_records").select("id").neq("user_id", me).limit(5);
  check(
    "aal2: other users' sync_records invisible",
    !others.error && others.data.length === 0,
    others.error?.message ?? `${others.data.length} rows`,
  );
  const otherKeys = await sb.from("user_keys").select("user_id").neq("user_id", me).limit(1);
  check(
    "aal2: other users' user_keys invisible",
    !otherKeys.error && otherKeys.data.length === 0,
    otherKeys.error?.message ?? `${otherKeys.data.length} rows`,
  );
  const forged = await sb.from("sync_records").insert(probe(randomUUID()));
  check(
    "aal2: insert as another user rejected",
    Boolean(forged.error),
    forged.error?.code ?? "INSERTED",
  );

  const del = await sb.from("sync_records").delete().eq("entity", "rls_probe");
  check("cleanup: probe rows deleted", !del.error, del.error?.message ?? "");
}

await sb.auth.signOut();
const failed = results.filter((ok) => !ok).length;
console.log(`\nRESULT: ${failed === 0 ? "PASS" : `FAIL (${failed} check(s))`}`);
process.exit(failed === 0 ? 0 : 1);
