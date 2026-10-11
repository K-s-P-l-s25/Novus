import { useState } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AuthCard, Button, ErrorText, Field } from "../../components/forms";
import { ipc } from "../../lib/ipc";
import { afterUnlock } from "./keysFlow";
import { authErrorMessage } from "./messages";

/** Daily unlock (SPEC §4.3): local only, works with no network. */
export function UnlockPage() {
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const client = useQueryClient();

  return (
    <AuthCard title="Unlock" intro="Enter your master passphrase.">
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          ipc
            .keysUnlock(pass)
            // The route guard returns to the room that asked for the unlock.
            .then(() => afterUnlock(client))
            .catch((err: unknown) => setError(authErrorMessage(err, "keys")))
            .finally(() => setBusy(false));
        }}
      >
        <Field
          id="unlock-passphrase"
          label="Master passphrase"
          type="password"
          value={pass}
          onChange={setPass}
          autoComplete="current-password"
        />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" busy={busy} disabled={!pass}>
          Unlock
        </Button>
        <Link
          to="/recover"
          className="flex min-h-12 items-center justify-center text-sm text-muted underline"
        >
          Forgot your passphrase? Use your recovery key
        </Link>
      </form>
    </AuthCard>
  );
}
