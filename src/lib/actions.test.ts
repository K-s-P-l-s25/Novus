import { describe, expect, it, vi } from "vitest";
import { ActionRegistry, matchesAccelerator, parseAccelerator } from "./actions";

const key = (
  k: string,
  mods: Partial<Record<"ctrlKey" | "shiftKey" | "altKey" | "metaKey", boolean>> = {},
) => ({
  key: k,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ...mods,
});

describe("parseAccelerator", () => {
  it("parses modifiers and key", () => {
    expect(parseAccelerator("Ctrl+Shift+F")).toEqual({
      ctrl: true,
      shift: true,
      alt: false,
      meta: false,
      key: "f",
    });
    expect(parseAccelerator("F11")).toEqual({
      ctrl: false,
      shift: false,
      alt: false,
      meta: false,
      key: "f11",
    });
  });
  it("rejects malformed accelerators", () => {
    expect(parseAccelerator("Ctrl+")).toBeNull();
    expect(parseAccelerator("Ctrl+Shift")).toBeNull();
    expect(parseAccelerator("Hyper+K")).toBeNull();
  });
  it("matches exact modifier sets only", () => {
    const acc = parseAccelerator("Ctrl+1");
    if (!acc) throw new Error("parse failed");
    expect(matchesAccelerator(acc, key("1", { ctrlKey: true }))).toBe(true);
    expect(matchesAccelerator(acc, key("1", { ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(matchesAccelerator(acc, key("1"))).toBe(false);
  });
});

describe("ActionRegistry", () => {
  it("registers, finds by key, runs and unregisters", async () => {
    const reg = new ActionRegistry();
    const run = vi.fn();
    const off = reg.register({
      id: "a.one",
      title: "One",
      group: "Test",
      defaultAccelerator: "Ctrl+K",
      run,
    });
    expect(reg.forKey(key("k", { ctrlKey: true }))?.id).toBe("a.one");
    expect(await reg.run("a.one")).toBe(true);
    expect(run).toHaveBeenCalledOnce();
    off();
    expect(reg.get("a.one")).toBeUndefined();
    expect(await reg.run("a.one")).toBe(false);
  });
  it("rejects duplicate ids", () => {
    const reg = new ActionRegistry();
    reg.register({ id: "dup", title: "x", group: "g", run: () => undefined });
    expect(() =>
      reg.register({ id: "dup", title: "y", group: "g", run: () => undefined }),
    ).toThrow();
  });
  it("hides and refuses actions whose `when` is false", async () => {
    const reg = new ActionRegistry();
    const run = vi.fn();
    reg.register({
      id: "w",
      title: "w",
      group: "g",
      defaultAccelerator: "Ctrl+W",
      when: () => false,
      run,
    });
    expect(reg.list()).toHaveLength(0);
    expect(reg.forKey(key("w", { ctrlKey: true }))).toBeUndefined();
    expect(await reg.run("w")).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });
});
