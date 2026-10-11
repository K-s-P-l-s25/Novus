// Glue between the key commands, the encrypted session store and Supabase (SPEC §4.3).
import type { QueryClient } from "@tanstack/react-query";
import type { KeysStatus } from "../../types/generated/KeysStatus";
import type { UserKeysRow } from "../../types/generated/UserKeysRow";
import { ipc } from "../../lib/ipc";
import { pauseSecureSessionStore, persistSessionSecurely } from "../../lib/sessionStore";
import { getSupabase, uploadUserKeys } from "../../lib/supabase";

export const KEYS_STATUS_KEY = ["keys_status"] as const;
const PENDING_UPLOAD_KEY = "kaisen.user_keys.pending";

export function setKeysStatus(client: QueryClient, status: KeysStatus): void {
  client.setQueryData(KEYS_STATUS_KEY, status);
}

/** After any successful unlock: persist the session, then (in the background) retry uploads.
 *  Nothing here waits on the network, so the app opens offline. */
export async function afterUnlock(client: QueryClient): Promise<void> {
  await persistSessionSecurely();
  setKeysStatus(client, { has_keys: true, unlocked: true });
  void retryPendingUserKeysUpload();
}

export async function lockNow(client: QueryClient): Promise<void> {
  await ipc.keysLock();
  pauseSecureSessionStore();
  setKeysStatus(client, { has_keys: true, unlocked: false });
}

/** Uploads the wrapped-key row; if offline, keeps it (sealed) and retries after the next unlock. */
export async function publishUserKeys(
  row: UserKeysRow,
): Promise<"uploaded" | "pending" | "local-only"> {
  if (!getSupabase()) return "local-only";
  try {
    await uploadUserKeys(row);
    await ipc.secureKvDelete(PENDING_UPLOAD_KEY).catch(() => undefined);
    return "uploaded";
  } catch {
    await ipc.secureKvSet(PENDING_UPLOAD_KEY, JSON.stringify(row)).catch(() => undefined);
    return "pending";
  }
}

export async function retryPendingUserKeysUpload(): Promise<void> {
  if (!getSupabase()) return;
  try {
    const pending = await ipc.secureKvGet(PENDING_UPLOAD_KEY);
    if (pending) await publishUserKeys(JSON.parse(pending) as UserKeysRow);
  } catch {
    // Still offline or locked: try again after the next unlock.
  }
}
