// Build-time configuration from Vite env (.env, never committed; see .env.example).
// Missing values never break the app: it is offline-first and sync simply stays off.

export interface SupabaseConfig {
  url: string;
  publishableKey: string;
}

export function readSupabaseConfig(env: Record<string, string | undefined>): SupabaseConfig | null {
  const url = env.VITE_SUPABASE_URL?.trim();
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey || url.includes("<PROJECT_REF>")) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { url, publishableKey };
}

export const supabaseConfig: SupabaseConfig | null = readSupabaseConfig(import.meta.env);
