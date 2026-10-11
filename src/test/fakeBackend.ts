// A stateful stand-in for the Rust commands, for UI flow tests.
import type { KeysStatus } from "../types/generated/KeysStatus";

export const ROW = {
  kdf: "argon2id",
  kdf_params: { m_kib: 65536, t: 3, p: 1 },
  salt: "c2FsdA==",
  wrapped_dek_pass: "d3JhcHBlZA==",
  wrapped_dek_recovery: "cmVj",
  key_check: "Y2hlY2s=",
  version: 1,
};
export const RECOVERY = "ABCDE-FGHJK-MNPQR-STVWX-YZ012-34567-89ABC-DEFGH-JKMNP-QRSTV-WXYZ0";
export const GOOD_PASS = "orbit lantern pebble justice marrow";

export function createFakeBackend(initial: KeysStatus) {
  const state = { ...initial, kv: new Map<string, string>() };
  const calls: { cmd: string; args: Record<string, unknown> | undefined }[] = [];
  const locked = { kind: "Locked" };
  const wrongPass = {
    kind: "Validation",
    field: "passphrase",
    msg: "That passphrase is not correct.",
  };

  async function invoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
    calls.push({ cmd, args });
    switch (cmd) {
      case "app_info":
        return {
          version: "0.1.0",
          schema_version: 0,
          payload_v: 1,
          platform: "windows",
          device_id: null,
        };
      case "keys_status":
        return { has_keys: state.has_keys, unlocked: state.unlocked };
      case "keys_passphrase_strength": {
        const ok = String(args?.passphrase ?? "").length >= 12;
        return {
          score: ok ? 4 : 0,
          bits: ok ? 64 : 5,
          acceptable: ok,
          hints: ok ? [] : ["TooShort"],
        };
      }
      case "keys_bootstrap":
        state.has_keys = true;
        state.unlocked = true;
        return { user_keys_row: ROW, recovery_key: RECOVERY };
      case "keys_unlock":
        if (args?.passphrase !== GOOD_PASS) throw wrongPass;
        state.has_keys = true;
        state.unlocked = true;
        return null;
      case "keys_unlock_recovery":
        state.has_keys = true;
        state.unlocked = true;
        return null;
      case "keys_set_passphrase":
        if (!state.unlocked) throw locked;
        return ROW;
      case "keys_lock":
        state.unlocked = false;
        return null;
      case "secure_kv_get":
        if (!state.unlocked) throw locked;
        return state.kv.get(String(args?.key)) ?? null;
      case "secure_kv_set":
        if (!state.unlocked) throw locked;
        state.kv.set(String(args?.key), String(args?.value));
        return null;
      case "secure_kv_delete":
        if (!state.unlocked) throw locked;
        state.kv.delete(String(args?.key));
        return null;
      default:
        throw { kind: "NotFound" };
    }
  }
  return { state, calls, invoke };
}
