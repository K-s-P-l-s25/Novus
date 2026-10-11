import { describe, expect, it } from "vitest";
import { readSupabaseConfig } from "./env";

describe("readSupabaseConfig", () => {
  it("returns null when values are missing or still placeholders", () => {
    expect(readSupabaseConfig({})).toBeNull();
    expect(
      readSupabaseConfig({
        VITE_SUPABASE_URL: "https://<PROJECT_REF>.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: "k",
      }),
    ).toBeNull();
  });
  it("requires https", () => {
    expect(
      readSupabaseConfig({
        VITE_SUPABASE_URL: "http://x.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: "k",
      }),
    ).toBeNull();
  });
  it("accepts a real-looking config", () => {
    expect(
      readSupabaseConfig({
        VITE_SUPABASE_URL: " https://abc.supabase.co ",
        VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_1",
      }),
    ).toEqual({
      url: "https://abc.supabase.co",
      publishableKey: "sb_publishable_1",
    });
  });
});
