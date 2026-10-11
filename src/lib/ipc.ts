// Typed wrappers over Tauri commands: one function per command (SPEC §14.2).
// Errors are normalised to AppError so callers can switch on `kind`.
import { invoke } from "@tauri-apps/api/core";
import type { AppInfo } from "../types/generated/AppInfo";
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
};
