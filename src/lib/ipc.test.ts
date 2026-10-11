import { describe, expect, it, vi } from "vitest";
import { ipc } from "./ipc";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

describe("ipc key wrappers", () => {
  it("uses the camelCase argument names Tauri expects", async () => {
    invoke.mockResolvedValue(null);
    await ipc.keysUnlock("p");
    expect(invoke).toHaveBeenLastCalledWith("keys_unlock", { passphrase: "p", userKeysRow: null });
    await ipc.keysUnlockRecovery("r");
    expect(invoke).toHaveBeenLastCalledWith("keys_unlock_recovery", {
      recoveryKey: "r",
      userKeysRow: null,
    });
    await ipc.keysChangePassphrase("a", "b");
    expect(invoke).toHaveBeenLastCalledWith("keys_change_passphrase", { old: "a", new: "b" });
  });

  it("turns Rust errors into AppError values", async () => {
    invoke.mockRejectedValueOnce({ kind: "Locked" });
    await expect(ipc.keysLock()).rejects.toEqual({ kind: "Locked" });
    invoke.mockRejectedValueOnce("weird");
    await expect(ipc.keysStatus()).rejects.toEqual({ kind: "Internal", id: "ipc" });
  });
});
