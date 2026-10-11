import type { AppError } from "../types/generated/AppError";

const KINDS: ReadonlySet<string> = new Set([
  "Locked",
  "NotFound",
  "Validation",
  "LimitReached",
  "Conflict",
  "Crypto",
  "Io",
  "Internal",
]);

export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    typeof value.kind === "string" &&
    KINDS.has(value.kind)
  );
}

/** Anything thrown across IPC becomes an AppError; unknown shapes are treated as internal. */
export function toAppError(value: unknown): AppError {
  return isAppError(value) ? value : { kind: "Internal", id: "ipc" };
}

/** Short, content-free text for a toast (SPEC §14.2). */
export function errorMessage(error: AppError): string {
  switch (error.kind) {
    case "Locked":
      return "KAISEN is locked. Unlock to continue.";
    case "NotFound":
      return "That item no longer exists.";
    case "Validation":
      return error.msg;
    case "LimitReached":
      return `Limit reached: ${error.what}.`;
    case "Conflict":
      return "This changed on another device. Your copy was kept.";
    case "Crypto":
      return "A security check failed.";
    case "Io":
      return "Couldn't read or write local storage.";
    case "Internal":
      return `Something went wrong (ref ${error.id}).`;
  }
}
