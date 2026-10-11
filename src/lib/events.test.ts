import { describe, expect, it } from "vitest";
import { invalidationPrefixes } from "./events";

describe("invalidationPrefixes (SPEC §14.3)", () => {
  it("maps a quest completion to quest, gold and dashboard keys", () => {
    expect(invalidationPrefixes(["quest", "gold_entry"])).toEqual([
      "analytics",
      "gatehouse",
      "gold",
      "inventory",
      "quest",
      "quests",
      "shop",
      "timeline",
    ]);
  });
  it("ignores unknown entities", () => {
    expect(invalidationPrefixes(["nope"])).toEqual([]);
  });
});
