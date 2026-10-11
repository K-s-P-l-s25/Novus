// Storage adapter for the Supabase session (SPEC §4.4). The session lives in Rust's encrypted
// store, never in localStorage. Before unlock (first sign-in) and while locked it is held in
// memory only; `persistSessionSecurely()` flushes it after unlock.
import { ipc } from "./ipc";
import { isAppError } from "./errors";

const memory = new Map<string, string>();
let secure = false;

const isLocked = (e: unknown) => isAppError(e) && e.kind === "Locked";

export const sessionStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    if (secure) {
      try {
        return (await ipc.secureKvGet(key)) ?? memory.get(key) ?? null;
      } catch (e) {
        if (!isLocked(e)) throw e;
      }
    }
    return memory.get(key) ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    if (secure) {
      try {
        await ipc.secureKvSet(key, value);
        memory.delete(key);
        return;
      } catch (e) {
        if (!isLocked(e)) throw e;
      }
    }
    memory.set(key, value);
  },
  async removeItem(key: string): Promise<void> {
    memory.delete(key);
    if (secure) {
      try {
        await ipc.secureKvDelete(key);
      } catch (e) {
        if (!isLocked(e)) throw e;
      }
    }
  },
};

/** Call right after keys are unlocked: moves any in-memory session into the encrypted store. */
export async function persistSessionSecurely(): Promise<void> {
  secure = true;
  for (const [k, v] of [...memory]) {
    await ipc.secureKvSet(k, v);
    memory.delete(k);
  }
}

/** Call on lock: stop touching the encrypted store until the next unlock. */
export function pauseSecureSessionStore(): void {
  secure = false;
}

/** Test helper. */
export function resetSessionStoreForTests(): void {
  memory.clear();
  secure = false;
}
