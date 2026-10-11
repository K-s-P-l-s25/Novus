import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeBackend } from "../test/fakeBackend";
import {
  pauseSecureSessionStore,
  persistSessionSecurely,
  resetSessionStoreForTests,
  sessionStorageAdapter as store,
} from "./sessionStore";

const backend = vi.hoisted(() => ({
  current: null as null | ReturnType<typeof createFakeBackend>,
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) => backend.current?.invoke(cmd, args),
}));

beforeEach(() => resetSessionStoreForTests());

describe("Supabase session storage (SPEC §4.4)", () => {
  it("buffers in memory before unlock and flushes into the encrypted store after", async () => {
    backend.current = createFakeBackend({ has_keys: true, unlocked: false });
    await store.setItem("sb-auth", "session-json");
    expect(await store.getItem("sb-auth")).toBe("session-json");
    expect(backend.current.calls).toHaveLength(0);

    backend.current.state.unlocked = true;
    await persistSessionSecurely();
    expect(backend.current.state.kv.get("sb-auth")).toBe("session-json");
    expect(await store.getItem("sb-auth")).toBe("session-json");
  });

  it("never writes to localStorage", async () => {
    backend.current = createFakeBackend({ has_keys: true, unlocked: true });
    await persistSessionSecurely();
    await store.setItem("sb-auth", "x");
    expect(localStorage.length).toBe(0);
  });

  it("falls back to memory while locked instead of losing a refreshed session", async () => {
    backend.current = createFakeBackend({ has_keys: true, unlocked: true });
    await persistSessionSecurely();
    backend.current.state.unlocked = false;
    await store.setItem("sb-auth", "refreshed");
    expect(await store.getItem("sb-auth")).toBe("refreshed");
    pauseSecureSessionStore();
    backend.current.state.unlocked = true;
    await persistSessionSecurely();
    expect(backend.current.state.kv.get("sb-auth")).toBe("refreshed");
  });
});
