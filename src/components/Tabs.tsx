import { useSearchParams } from "react-router";
import { cn } from "../lib/cn";

export interface TabDef<T extends string> {
  id: T;
  label: string;
}

/** Tabs bound to a `?tab=` search param so they survive reloads and the back button. */
export function useTab<T extends string>(tabs: readonly TabDef<T>[]): [T, (id: T) => void] {
  const [params, setParams] = useSearchParams();
  const first = tabs[0];
  if (!first) throw new Error("useTab needs at least one tab");
  const current = tabs.find((t) => t.id === params.get("tab"))?.id ?? first.id;
  return [current, (id) => setParams({ tab: id }, { replace: true })];
}

export function TabBar<T extends string>({
  tabs,
  current,
  onSelect,
  label,
}: {
  tabs: readonly TabDef<T>[];
  current: T;
  onSelect: (id: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 rounded-card bg-surface p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === current}
          onClick={() => onSelect(t.id)}
          className={cn(
            "min-h-12 flex-1 rounded-card px-4 text-sm font-medium text-muted transition-colors",
            t.id === current && "bg-elevated text-text",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
