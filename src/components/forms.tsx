import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export function AuthCard({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-bg px-4 py-10 text-text">
      <div className="flex w-full max-w-md flex-col gap-6 rounded-card border border-border bg-surface p-6 md:p-8">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold tracking-[0.3em] text-accent">KAISEN</span>
          <h1 className="text-2xl font-semibold">{title}</h1>
          {intro && <div className="text-muted">{intro}</div>}
        </div>
        {children}
      </div>
    </main>
  );
}

export function Field({
  id,
  label,
  type = "text",
  value,
  onChange,
  autoComplete,
  inputMode,
  hint,
}: {
  id: string;
  label: string;
  type?: "text" | "email" | "password";
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  inputMode?: "text" | "numeric" | "email";
  hint?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        inputMode={inputMode}
        spellCheck={false}
        autoCapitalize="off"
        onChange={(e) => onChange(e.target.value)}
        className="min-h-12 rounded-card border border-border bg-bg px-4 text-text"
      />
      {hint && <div className="text-sm text-muted">{hint}</div>}
    </div>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  busy,
  variant = "primary",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: "primary" | "secondary";
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cn(
        "inline-flex min-h-12 items-center justify-center rounded-card px-5 font-medium disabled:opacity-50",
        variant === "primary" ? "bg-accent text-accent-fg" : "border border-border text-text",
      )}
    >
      {busy ? "Working…" : children}
    </button>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm text-danger">
      {children}
    </p>
  );
}
