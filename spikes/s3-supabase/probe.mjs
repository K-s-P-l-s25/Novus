// M0 spike S3: prove the restrictive aal2 RLS policy blocks an aal1 (password-only) session
// and allows the same user after TOTP (Proton Authenticator). Throwaway code.
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_PUBLISHABLE_KEY=sb_publishable_... \
//   KAISEN_EMAIL=you@example.com KAISEN_PASSWORD='...' npm run probe
//
// The password is read from the environment only; nothing is written to disk.
import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline/promises";
import { randomUUID } from "node:crypto";

const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, KAISEN_EMAIL, KAISEN_PASSWORD } = process.env;
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !KAISEN_EMAIL || !KAISEN_PASSWORD) {
  console.error("Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, KAISEN_EMAIL, KAISEN_PASSWORD");
  process.exit(2);
}

const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const rl = createInterface({ input: process.stdin, output: process.stdout });
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const probeRow = () => ({
  entity: "spike_probe",
  id: randomUUID(),
  hlc: `${String(Date.now()).padStart(13, "0")}-00000-spike000`,
  deleted: false,
  payload_v: 1,
  payload: Buffer.from("not-a-real-ciphertext").toString("base64"),
});

// ── 1. password only → aal1 ──
const { error: signInErr } = await sb.auth.signInWithPassword({ email: KAISEN_EMAIL, password: KAISEN_PASSWORD });
if (signInErr) { console.error("sign-in failed:", signInErr.message); process.exit(1); }
const aal1 = (await sb.auth.mfa.getAuthenticatorAssuranceLevel()).data;
check("session after password is aal1", aal1?.currentLevel === "aal1", `current=${aal1?.currentLevel} next=${aal1?.nextLevel}`);

{
  const sel = await sb.from("sync_records").select("id").limit(5);
  check("aal1: select sync_records returns no rows", !sel.error && sel.data.length === 0, sel.error?.message ?? `${sel.data.length} rows`);
  const keys = await sb.from("user_keys").select("user_id").limit(1);
  check("aal1: select user_keys returns no rows", !keys.error && keys.data.length === 0, keys.error?.message ?? `${keys.data.length} rows`);
  const ins = await sb.from("sync_records").insert(probeRow());
  check("aal1: direct insert rejected", !!ins.error, ins.error?.code ?? "inserted!");
  const rpc = await sb.rpc("sync_push", { rows: [probeRow()] });
  check("aal1: sync_push rejected", !!rpc.error, rpc.error?.code ?? "accepted!");
}

// ── 2. TOTP → aal2 ──
const factors = (await sb.auth.mfa.listFactors()).data;
let factorId = factors?.totp?.[0]?.id;
if (!factorId) {
  const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "Proton Authenticator" });
  if (error) { console.error("enrol failed:", error.message); process.exit(1); }
  factorId = data.id;
  console.log("\nNo verified TOTP factor yet. Add this to Proton Authenticator (and your offline backup):");
  console.log(`  otpauth URI: ${data.totp.uri}`);
  console.log(`  secret     : ${data.totp.secret}\n`);
}
const code = (await rl.question("6-digit code from Proton Authenticator: ")).trim();
rl.close();
const { error: vErr } = await sb.auth.mfa.challengeAndVerify({ factorId, code });
check("TOTP verify succeeds", !vErr, vErr?.message ?? "");
const aal2 = (await sb.auth.mfa.getAuthenticatorAssuranceLevel()).data;
check("session after TOTP is aal2", aal2?.currentLevel === "aal2", `current=${aal2?.currentLevel}`);

if (aal2?.currentLevel === "aal2") {
  const row = probeRow();
  const rpc = await sb.rpc("sync_push", { rows: [row] });
  const accepted = !rpc.error && rpc.data?.[0]?.out_accepted === true;
  check("aal2: sync_push accepted", accepted, rpc.error?.message ?? "");
  const sel = await sb.from("sync_records").select("id").eq("id", row.id);
  check("aal2: own row readable", !sel.error && sel.data.length === 1, sel.error?.message ?? `${sel.data.length} rows`);
  const del = await sb.from("sync_records").delete().eq("entity", "spike_probe");
  check("aal2: probe rows cleaned up", !del.error, del.error?.message ?? "");
}

await sb.auth.signOut();
const failed = results.filter((r) => !r.ok).length;
console.log(`\nRESULT: ${failed === 0 ? "PASS" : `FAIL (${failed} check(s))`}`);
process.exit(failed === 0 ? 0 : 1);
