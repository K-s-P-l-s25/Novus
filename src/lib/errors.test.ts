import { describe, expect, it } from "vitest";
import { errorMessage, isAppError, toAppError } from "./errors";

describe("AppError helpers", () => {
  it("recognises AppError shapes", () => {
    expect(isAppError({ kind: "Locked" })).toBe(true);
    expect(isAppError({ kind: "Nope" })).toBe(false);
    expect(isAppError("Locked")).toBe(false);
  });
  it("turns unknown failures into an internal error", () => {
    expect(toAppError(new Error("boom"))).toEqual({ kind: "Internal", id: "ipc" });
  });
  it("shows the internal reference id", () => {
    expect(errorMessage({ kind: "Internal", id: "ab12cd34" })).toContain("ab12cd34");
  });
});
