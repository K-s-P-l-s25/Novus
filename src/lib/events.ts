// Bridges Rust's "kaisen://changed" event to TanStack Query invalidation (SPEC §14.3).
// Rust starts emitting it with the repository in M4; the mapping is defined now.
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { QueryClient } from "@tanstack/react-query";

export const CHANGED_EVENT = "kaisen://changed";

export interface ChangedPayload {
  /** Sync entity names touched by one commit, e.g. ["quest", "gold_entry"]. */
  entities: string[];
}

/** Query-key prefixes to invalidate per entity. Prefix matching covers per-id keys. */
const PREFIXES: Record<string, readonly string[]> = {
  vault: ["vaults"],
  file: ["files", "file", "recent", "gatehouse"],
  note_content: ["files", "file", "recent", "gatehouse"],
  canvas_content: ["files", "file", "recent", "gatehouse"],
  codex_snippet: ["files", "file", "recent", "gatehouse"],
  board_column: ["board"],
  board_card: ["board"],
  card_item: ["board"],
  quest: ["quests", "quest", "timeline", "analytics", "gatehouse"],
  quest_item: ["quests", "quest", "timeline", "analytics", "gatehouse"],
  time_entry: ["quests", "quest", "timeline", "analytics", "gatehouse"],
  gold_entry: ["gold", "shop", "inventory", "analytics"],
  inventory_event: ["gold", "shop", "inventory", "analytics"],
  shop_item: ["gold", "shop", "inventory", "analytics"],
  tag: ["tags"],
  tagging: ["tags"],
  link: ["links", "backlinks"],
  template: ["templates", "gatehouse"],
  setting: ["settings"],
  device: ["devices"],
};

export function invalidationPrefixes(entities: readonly string[]): string[] {
  const out = new Set<string>();
  for (const e of entities) for (const p of PREFIXES[e] ?? []) out.add(p);
  return [...out].sort();
}

export async function startEventBridge(client: QueryClient): Promise<UnlistenFn> {
  return listen<ChangedPayload>(CHANGED_EVENT, (event) => {
    for (const prefix of invalidationPrefixes(event.payload.entities)) {
      void client.invalidateQueries({ queryKey: [prefix] });
    }
  });
}
