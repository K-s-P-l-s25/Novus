import { useState } from "react";
import { Button, ErrorText, Field } from "../../components/forms";

/** Shows the recovery key once and requires proof it was written down (SPEC §4.3 step 6). */
export function RecoveryKeyStep({
  recoveryKey,
  onConfirmed,
}: {
  recoveryKey: string;
  onConfirmed: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [stored, setStored] = useState(false);
  const groups = recoveryKey.split("-");
  const last = groups.at(-1) ?? "";
  const matches = typed.trim().toUpperCase() === last;
  return (
    <div className="flex flex-col gap-5">
      <p className="text-muted">
        This key unlocks your data if you forget your passphrase. KAISEN shows it{" "}
        <strong>only once</strong> and cannot recover it. Write it down or store it in your password
        manager.
      </p>
      <ol
        className="grid grid-cols-3 gap-2 rounded-card bg-elevated p-4 font-mono text-sm tracking-wider md:grid-cols-4"
        aria-label="Recovery key"
        data-testid="recovery-key"
      >
        {groups.map((g, i) => (
          <li key={i}>{g}</li>
        ))}
      </ol>
      <label className="flex min-h-12 items-center gap-3">
        <input
          type="checkbox"
          checked={stored}
          onChange={(e) => setStored(e.target.checked)}
          className="size-5 accent-accent"
        />
        <span>I have stored my recovery key somewhere safe.</span>
      </label>
      <Field
        id="recovery-confirm"
        label="Type the last group to confirm"
        value={typed}
        onChange={setTyped}
        autoComplete="off"
      />
      <ErrorText>
        {typed.length >= 5 && !matches ? "That doesn't match the last group." : null}
      </ErrorText>
      <Button onClick={onConfirmed} disabled={!stored || !matches}>
        Continue
      </Button>
    </div>
  );
}
