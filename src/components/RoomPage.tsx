import type { ReactNode } from "react";

/** Common room frame: one heading, optional toolbar, scrollable content. */
export function RoomPage({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 md:p-8">
      <header className="flex min-h-12 items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {actions}
      </header>
      {children}
    </section>
  );
}

/** Every list has an empty state with one clear message (SPEC §14.5). */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border bg-surface px-6 py-12 text-center">
      <p className="text-lg font-medium">{title}</p>
      <p className="max-w-md text-muted">{body}</p>
      {action}
    </div>
  );
}
