// Typed wrappers over Tauri commands: one function per command (SPEC §14.2).
// Errors are normalised to AppError so callers can switch on `kind`.
//
// 🔒 Passphrases and recovery keys are passed straight to Rust and must not be stored,
// logged or kept in React state longer than the form that collects them.
import { invoke } from "@tauri-apps/api/core";
import type { AppInfo } from "../types/generated/AppInfo";
import type { KeysStatus } from "../types/generated/KeysStatus";
import type { KeysWithRecovery } from "../types/generated/KeysWithRecovery";
import type { PassphraseStrength } from "../types/generated/PassphraseStrength";
import type { UserKeysRow } from "../types/generated/UserKeysRow";
import { toAppError } from "./errors";

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (e) {
    throw toAppError(e);
  }
}

export const ipc = {
  appInfo: (): Promise<AppInfo> => call<AppInfo>("app_info"),

  keysStatus: (): Promise<KeysStatus> => call<KeysStatus>("keys_status"),
  keysPassphraseStrength: (passphrase: string): Promise<PassphraseStrength> =>
    call<PassphraseStrength>("keys_passphrase_strength", { passphrase }),
  keysBootstrap: (passphrase: string): Promise<KeysWithRecovery> =>
    call<KeysWithRecovery>("keys_bootstrap", { passphrase }),
  keysUnlock: (passphrase: string, userKeysRow?: UserKeysRow): Promise<undefined> =>
    call<undefined>("keys_unlock", { passphrase, userKeysRow: userKeysRow ?? null }),
  keysUnlockRecovery: (recoveryKey: string, userKeysRow?: UserKeysRow): Promise<undefined> =>
    call<undefined>("keys_unlock_recovery", { recoveryKey, userKeysRow: userKeysRow ?? null }),
  keysLock: (): Promise<undefined> => call<undefined>("keys_lock"),
  keysChangePassphrase: (oldPassphrase: string, newPassphrase: string): Promise<UserKeysRow> =>
    call<UserKeysRow>("keys_change_passphrase", { old: oldPassphrase, new: newPassphrase }),
  keysRegenerateRecovery: (passphrase: string): Promise<KeysWithRecovery> =>
    call<KeysWithRecovery>("keys_regenerate_recovery", { passphrase }),
  keysSetPassphrase: (newPassphrase: string): Promise<UserKeysRow> =>
    call<UserKeysRow>("keys_set_passphrase", { new: newPassphrase }),

  secureKvGet: (key: string): Promise<string | null> =>
    call<string | null>("secure_kv_get", { key }),
  secureKvSet: (key: string, value: string): Promise<undefined> =>
    call<undefined>("secure_kv_set", { key, value }),
  secureKvDelete: (key: string): Promise<undefined> => call<undefined>("secure_kv_delete", { key }),
};
