// Action registry shared by the command palette (M7), shortcuts (M15) and menus (SPEC §14.4).
// Features register their actions once; accelerators are matched here.

export interface Action {
  id: string;
  title: string;
  group: string;
  /** e.g. "Ctrl+Shift+F". Remappable per device in M15. */
  defaultAccelerator?: string;
  /** Whether the action is currently available. */
  when?: () => boolean;
  run: () => void | Promise<void>;
}

export interface Accelerator {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  key: string;
}

const MODIFIERS = new Set(["ctrl", "control", "shift", "alt", "meta", "cmd"]);

export function parseAccelerator(text: string): Accelerator | null {
  const parts = text.split("+").map((p) => p.trim().toLowerCase());
  const key = parts.at(-1);
  if (!key || MODIFIERS.has(key)) return null;
  const mods = new Set(parts.slice(0, -1));
  for (const m of mods) if (!MODIFIERS.has(m)) return null;
  return {
    ctrl: mods.has("ctrl") || mods.has("control"),
    shift: mods.has("shift"),
    alt: mods.has("alt"),
    meta: mods.has("meta") || mods.has("cmd"),
    key,
  };
}

type KeyLike = Pick<KeyboardEvent, "key" | "ctrlKey" | "shiftKey" | "altKey" | "metaKey">;

export function matchesAccelerator(acc: Accelerator, e: KeyLike): boolean {
  return (
    e.key.toLowerCase() === acc.key &&
    e.ctrlKey === acc.ctrl &&
    e.shiftKey === acc.shift &&
    e.altKey === acc.alt &&
    e.metaKey === acc.meta
  );
}

export class ActionRegistry {
  private readonly actions = new Map<string, Action>();

  /** Registers an action and returns a function that removes it. */
  register(action: Action): () => void {
    if (this.actions.has(action.id)) throw new Error(`duplicate action id: ${action.id}`);
    this.actions.set(action.id, action);
    return () => {
      if (this.actions.get(action.id) === action) this.actions.delete(action.id);
    };
  }

  list(): Action[] {
    return [...this.actions.values()].filter((a) => a.when?.() ?? true);
  }

  get(id: string): Action | undefined {
    return this.actions.get(id);
  }

  async run(id: string): Promise<boolean> {
    const action = this.actions.get(id);
    if (!action || !(action.when?.() ?? true)) return false;
    await action.run();
    return true;
  }

  /** The action bound to this key press, if any. */
  forKey(e: KeyLike): Action | undefined {
    for (const action of this.list()) {
      const acc = action.defaultAccelerator && parseAccelerator(action.defaultAccelerator);
      if (acc && matchesAccelerator(acc, e)) return action;
    }
    return undefined;
  }
}

export const actions = new ActionRegistry();
