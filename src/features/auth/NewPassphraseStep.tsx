import { useState } from "react";
import { Button, ErrorText, Field } from "../../components/forms";
import { PassphraseStrengthMeter } from "../keys/PassphraseStrengthMeter";

/** Choose and confirm a master passphrase. Rust re-checks strength before accepting it. */
export function NewPassphraseStep({
  submitLabel,
  busy,
  error,
  onSubmit,
}: {
  submitLabel: string;
  busy: boolean;
  error: string | null;
  onSubmit: (passphrase: string) => void;
}) {
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const mismatch = confirm.length > 0 && confirm !== pass;
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!mismatch && pass) onSubmit(pass);
      }}
    >
      <Field
        id="new-passphrase"
        label="Master passphrase"
        type="password"
        value={pass}
        onChange={setPass}
        autoComplete="new-password"
        hint="Use 4–5 random words or 12+ mixed characters. It never leaves this device and is not your Supabase password."
      />
      <PassphraseStrengthMeter passphrase={pass} />
      <Field
        id="confirm-passphrase"
        label="Confirm passphrase"
        type="password"
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
      />
      <ErrorText>{mismatch ? "The passphrases don't match." : error}</ErrorText>
      <Button type="submit" busy={busy} disabled={!pass || confirm !== pass}>
        {submitLabel}
      </Button>
    </form>
  );
}
