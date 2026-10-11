// Supabase client: auth, TOTP MFA and the user_keys row (SPEC §4, Appendix B).
// TypeScript owns network I/O; it only ever moves ciphertext (CLAUDE.md rule 3).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { UserKeysRow } from "../types/generated/UserKeysRow";
import { supabaseConfig } from "./env";
import { sessionStorageAdapter } from "./sessionStore";

let client: SupabaseClient | null = null;

/** The client, or null when this build has no Supabase config (local-only mode). */
export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfig) return null;
  client ??= createClient(supabaseConfig.url, supabaseConfig.publishableKey, {
    auth: {
      storage: sessionStorageAdapter,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}

function requireClient(): SupabaseClient {
  const c = getSupabase();
  if (!c) throw new Error("Supabase is not configured for this build");
  return c;
}

export type MfaState = "none" | "enrolled" | "verified";

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await requireClient().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await getSupabase()?.auth.signOut({ scope: "local" });
}

/** "verified" = session is aal2; "enrolled" = a TOTP factor exists but this session is aal1. */
export async function mfaState(): Promise<{ state: MfaState; factorId: string | null }> {
  const sb = requireClient();
  const { data: aal, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  const { data: factors, error: e2 } = await sb.auth.mfa.listFactors();
  if (e2) throw e2;
  const totp = factors.totp[0] ?? null;
  if (aal.currentLevel === "aal2") return { state: "verified", factorId: totp?.id ?? null };
  return { state: totp ? "enrolled" : "none", factorId: totp?.id ?? null };
}

export interface TotpEnrolment {
  factorId: string;
  /** SVG as a data: URL, safe for <img src>. */
  qrCode: string;
  secret: string;
  uri: string;
}

export async function enrolTotp(): Promise<TotpEnrolment> {
  const sb = requireClient();
  // Drop half-finished enrolments from an earlier attempt so the friendly name stays unique.
  const { data: existing } = await sb.auth.mfa.listFactors();
  for (const f of existing?.all ?? []) {
    if (f.factor_type === "totp" && f.status === "unverified")
      await sb.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await sb.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Proton Authenticator",
  });
  if (error) throw error;
  return {
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
    uri: data.totp.uri,
  };
}

export async function verifyTotp(factorId: string, code: string): Promise<void> {
  const { error } = await requireClient().auth.mfa.challengeAndVerify({ factorId, code });
  if (error) throw error;
}

const USER_KEYS_COLUMNS =
  "kdf,kdf_params,salt,wrapped_dek_pass,wrapped_dek_recovery,key_check,version";

export async function fetchUserKeys(): Promise<UserKeysRow | null> {
  const { data, error } = await requireClient()
    .from("user_keys")
    .select(USER_KEYS_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return (data as UserKeysRow | null) ?? null;
}

export async function uploadUserKeys(row: UserKeysRow): Promise<void> {
  const sb = requireClient();
  const { data: user, error: e1 } = await sb.auth.getUser();
  if (e1) throw e1;
  const { error } = await sb
    .from("user_keys")
    .upsert(
      { ...row, user_id: user.user.id, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) throw error;
}

export async function currentEmail(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.user.email ?? null;
}
