import { useState } from "react";
import { Link } from "react-router";
import { PassphraseStrengthMeter } from "../keys/PassphraseStrengthMeter";
import { Icon } from "../../components/Icon";

const COPY = {
  setup: {
    title: "Set up KAISEN",
    body: "Sign in, add two-factor authentication and create your passphrase (M3).",
  },
  auth: { title: "Sign in", body: "Email, password and Proton Authenticator code (M3)." },
  unlock: { title: "Unlock", body: "Enter your master passphrase to open your data (M2–M3)." },
  recover: { title: "Recover", body: "Use your recovery key to regain access (M2–M3)." },
} as const;

/** Full-screen system routes, outside the room shell (SPEC §14.1). */
export function SystemPage({ kind }: { kind: keyof typeof COPY }) {
  const { title, body } = COPY[kind];
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg p-6 text-center text-text">
      <Icon name="lock" className="size-10 text-accent" />
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="max-w-sm text-muted">{body}</p>
      {kind === "setup" && <PassphrasePreview />}
      <Link
        to="/"
        className="inline-flex min-h-12 items-center rounded-card border border-border px-5"
      >
        Back to the Gatehouse
      </Link>
    </main>
  );
}

/** Step "create your master passphrase" of the first-run wizard. Saving comes with M3. */
function PassphrasePreview() {
  const [value, setValue] = useState("");
  return (
    <div className="flex w-full max-w-sm flex-col gap-3 text-left">
      <label htmlFor="master-passphrase" className="text-sm font-medium">
        Master passphrase
      </label>
      <input
        id="master-passphrase"
        type="password"
        autoComplete="new-password"
        spellCheck={false}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="min-h-12 rounded-card border border-border bg-surface px-4 text-text"
      />
      <PassphraseStrengthMeter passphrase={value} />
    </div>
  );
}
