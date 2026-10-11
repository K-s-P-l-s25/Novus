// First run (SPEC §4.3): sign in → TOTP (enrol with QR + manual secret, or verify) →
// existing key row? unlock with passphrase/recovery key : create passphrase → recovery key.
// Without Supabase config (local-only build) it starts at "create passphrase".
import { useState } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { UserKeysRow } from "../../types/generated/UserKeysRow";
import { AuthCard, Button, ErrorText, Field } from "../../components/forms";
import { ipc } from "../../lib/ipc";
import {
  enrolTotp,
  fetchUserKeys,
  getSupabase,
  mfaState,
  signIn,
  verifyTotp,
  type TotpEnrolment,
} from "../../lib/supabase";
import { afterUnlock, publishUserKeys } from "./keysFlow";
import { authErrorMessage } from "./messages";
import { NewPassphraseStep } from "./NewPassphraseStep";
import { RecoveryKeyStep } from "./RecoveryKeyStep";

type Step =
  | { kind: "signin" }
  | { kind: "enrol"; enrolment: TotpEnrolment }
  | { kind: "totp"; factorId: string }
  | { kind: "create" }
  | { kind: "existing"; row: UserKeysRow; useRecovery: boolean }
  | { kind: "reset-passphrase" }
  | { kind: "recovery"; recoveryKey: string };

const TITLES: Record<Step["kind"], string> = {
  signin: "Sign in",
  enrol: "Set up two-factor authentication",
  totp: "Two-factor code",
  create: "Create your master passphrase",
  existing: "Unlock your data",
  "reset-passphrase": "Choose a new passphrase",
  recovery: "Save your recovery key",
};

export function SetupWizard() {
  const online = getSupabase() !== null;
  const [step, setStep] = useState<Step>(online ? { kind: "signin" } : { kind: "create" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const client = useQueryClient();
  const navigate = useNavigate();

  async function run(context: Parameters<typeof authErrorMessage>[1], f: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await f();
    } catch (e) {
      setError(authErrorMessage(e, context));
    } finally {
      setBusy(false);
    }
  }

  const finish = async () => {
    await afterUnlock(client);
    void navigate("/", { replace: true });
  };

  /** After aal2: a server key row means this is a new device; otherwise create keys. */
  const afterMfa = () =>
    run("network", async () => {
      const row = await fetchUserKeys();
      setStep(row ? { kind: "existing", row, useRecovery: false } : { kind: "create" });
    });

  const intro =
    step.kind === "signin"
      ? "Use the KAISEN account you created in Supabase."
      : step.kind === "create" && !online
        ? "This build has no Supabase project configured, so KAISEN runs on this device only. Sync can be added later."
        : undefined;

  return (
    <AuthCard title={TITLES[step.kind]} intro={intro}>
      {step.kind === "signin" && (
        <SignInForm
          busy={busy}
          error={error}
          onSubmit={(email, password) =>
            run("signin", async () => {
              await signIn(email, password);
              const mfa = await mfaState();
              if (mfa.state === "verified") return afterMfa();
              if (mfa.state === "enrolled" && mfa.factorId)
                setStep({ kind: "totp", factorId: mfa.factorId });
              else setStep({ kind: "enrol", enrolment: await enrolTotp() });
            })
          }
        />
      )}

      {step.kind === "enrol" && (
        <TotpForm
          busy={busy}
          error={error}
          enrolment={step.enrolment}
          onSubmit={(code) =>
            run("totp", async () => {
              await verifyTotp(step.enrolment.factorId, code);
              await afterMfa();
            })
          }
        />
      )}

      {step.kind === "totp" && (
        <TotpForm
          busy={busy}
          error={error}
          onSubmit={(code) =>
            run("totp", async () => {
              await verifyTotp(step.factorId, code);
              await afterMfa();
            })
          }
        />
      )}

      {step.kind === "create" && (
        <NewPassphraseStep
          submitLabel="Create passphrase"
          busy={busy}
          error={error}
          onSubmit={(passphrase) =>
            run("keys", async () => {
              const { user_keys_row, recovery_key } = await ipc.keysBootstrap(passphrase);
              await publishUserKeys(user_keys_row);
              setStep({ kind: "recovery", recoveryKey: recovery_key });
            })
          }
        />
      )}

      {step.kind === "existing" && (
        <ExistingKeysForm
          busy={busy}
          error={error}
          useRecovery={step.useRecovery}
          onToggle={() => setStep({ ...step, useRecovery: !step.useRecovery })}
          onSubmit={(secret) =>
            run("keys", async () => {
              if (step.useRecovery) {
                await ipc.keysUnlockRecovery(secret, step.row);
                setStep({ kind: "reset-passphrase" });
              } else {
                await ipc.keysUnlock(secret, step.row);
                await finish();
              }
            })
          }
        />
      )}

      {step.kind === "reset-passphrase" && (
        <NewPassphraseStep
          submitLabel="Save new passphrase"
          busy={busy}
          error={error}
          onSubmit={(passphrase) =>
            run("keys", async () => {
              const row = await ipc.keysSetPassphrase(passphrase);
              await publishUserKeys(row);
              await finish();
            })
          }
        />
      )}

      {step.kind === "recovery" && (
        <RecoveryKeyStep recoveryKey={step.recoveryKey} onConfirmed={() => void finish()} />
      )}
    </AuthCard>
  );
}

export function SignInForm({
  busy,
  error,
  onSubmit,
}: {
  busy: boolean;
  error: string | null;
  onSubmit: (email: string, password: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(email.trim(), password);
      }}
    >
      <Field
        id="email"
        label="Email"
        type="email"
        inputMode="email"
        value={email}
        onChange={setEmail}
        autoComplete="username"
      />
      <Field
        id="password"
        label="Password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
      />
      <ErrorText>{error}</ErrorText>
      <Button type="submit" busy={busy} disabled={!email || !password}>
        Sign in
      </Button>
    </form>
  );
}

export function TotpForm({
  busy,
  error,
  enrolment,
  onSubmit,
}: {
  busy: boolean;
  error: string | null;
  enrolment?: TotpEnrolment;
  onSubmit: (code: string) => void;
}) {
  const [code, setCode] = useState("");
  const clean = code.replace(/\s/g, "");
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (/^\d{6}$/.test(clean)) onSubmit(clean);
      }}
    >
      {enrolment && (
        <div className="flex flex-col gap-4">
          <p className="text-muted">
            In <strong>Proton Authenticator</strong>, add a new entry: scan this QR code on your
            phone, or on Windows paste the setup key. Also keep an offline copy of the setup key
            somewhere safe (SPEC §4.4).
          </p>
          <img
            src={enrolment.qrCode}
            alt="QR code for Proton Authenticator"
            className="mx-auto size-48 rounded-card bg-surface p-2"
          />
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Setup key</span>
            <code
              className="break-all rounded-card bg-elevated p-3 font-mono text-sm"
              data-testid="totp-secret"
            >
              {enrolment.secret}
            </code>
          </div>
        </div>
      )}
      <Field
        id="totp-code"
        label="6-digit code from Proton Authenticator"
        inputMode="numeric"
        value={code}
        onChange={setCode}
        autoComplete="one-time-code"
      />
      <ErrorText>{error}</ErrorText>
      <Button type="submit" busy={busy} disabled={!/^\d{6}$/.test(clean)}>
        Verify
      </Button>
    </form>
  );
}

function ExistingKeysForm({
  busy,
  error,
  useRecovery,
  onToggle,
  onSubmit,
}: {
  busy: boolean;
  error: string | null;
  useRecovery: boolean;
  onToggle: () => void;
  onSubmit: (secret: string) => void;
}) {
  const [secret, setSecret] = useState("");
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(secret);
      }}
    >
      <p className="text-muted">
        Your account already has encrypted data. Enter the master passphrase you created on your
        other device.
      </p>
      <Field
        id="existing-secret"
        label={useRecovery ? "Recovery key" : "Master passphrase"}
        type={useRecovery ? "text" : "password"}
        value={secret}
        onChange={setSecret}
        autoComplete={useRecovery ? "off" : "current-password"}
      />
      <ErrorText>{error}</ErrorText>
      <Button type="submit" busy={busy} disabled={!secret}>
        Unlock
      </Button>
      <Button variant="secondary" onClick={onToggle}>
        {useRecovery ? "Use my passphrase instead" : "I forgot my passphrase: use the recovery key"}
      </Button>
    </form>
  );
}
