import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AuthCard, Button, ErrorText, Field } from "../../components/forms";
import { ipc } from "../../lib/ipc";
import { afterUnlock, publishUserKeys } from "./keysFlow";
import { authErrorMessage } from "./messages";
import { NewPassphraseStep } from "./NewPassphraseStep";

/** Forgotten passphrase: unlock with the recovery key, then set a new passphrase. */
export function RecoverPage() {
  const [stage, setStage] = useState<"key" | "passphrase">("key");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const client = useQueryClient();
  const navigate = useNavigate();

  const attempt = (f: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    f()
      .catch((err: unknown) => setError(authErrorMessage(err, "keys")))
      .finally(() => setBusy(false));
  };

  if (stage === "passphrase") {
    return (
      <AuthCard
        title="Choose a new passphrase"
        intro="Your recovery key worked. Set a new master passphrase."
      >
        <NewPassphraseStep
          submitLabel="Save and continue"
          busy={busy}
          error={error}
          onSubmit={(pass) =>
            attempt(async () => {
              const row = await ipc.keysSetPassphrase(pass);
              await afterUnlock(client);
              void publishUserKeys(row);
              void navigate("/", { replace: true });
            })
          }
        />
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Recover" intro="Enter the recovery key you saved when you set up KAISEN.">
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          attempt(async () => {
            await ipc.keysUnlockRecovery(recoveryKey);
            setStage("passphrase");
          });
        }}
      >
        <Field
          id="recovery-key"
          label="Recovery key"
          value={recoveryKey}
          onChange={setRecoveryKey}
          autoComplete="off"
          hint="Dashes, spaces and capitals don't matter."
        />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" busy={busy} disabled={!recoveryKey}>
          Unlock
        </Button>
        <Link
          to="/unlock"
          className="flex min-h-12 items-center justify-center text-sm text-muted underline"
        >
          Back to passphrase unlock
        </Link>
      </form>
    </AuthCard>
  );
}
