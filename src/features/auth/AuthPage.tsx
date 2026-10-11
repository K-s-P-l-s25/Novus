import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { AuthCard } from "../../components/forms";
import { getSupabase, mfaState, signIn, verifyTotp } from "../../lib/supabase";
import { authErrorMessage } from "./messages";
import { SignInForm, TotpForm } from "./SetupWizard";

/** "Needs sign-in" (SPEC §9.1): the Supabase session expired. Local data stays open; only sync
 *  waits. Reached while unlocked, so the new session goes straight into the encrypted store. */
export function AuthPage() {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const run = (context: "signin" | "totp", f: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    f()
      .catch((e: unknown) => setError(authErrorMessage(e, context)))
      .finally(() => setBusy(false));
  };

  if (!getSupabase()) {
    return (
      <AuthCard
        title="Sign in"
        intro="This build has no Supabase project configured, so there is nothing to sign in to."
      >
        <Link to="/" className="text-accent underline">
          Back
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={factorId ? "Two-factor code" : "Sign in"}
      intro="Sign in again to resume sync. Your notes stay available meanwhile."
    >
      {factorId ? (
        <TotpForm
          busy={busy}
          error={error}
          onSubmit={(code) =>
            run("totp", async () => {
              await verifyTotp(factorId, code);
              void navigate(-1);
            })
          }
        />
      ) : (
        <SignInForm
          busy={busy}
          error={error}
          onSubmit={(email, password) =>
            run("signin", async () => {
              await signIn(email, password);
              const mfa = await mfaState();
              if (mfa.state === "verified") void navigate(-1);
              else if (mfa.factorId) setFactorId(mfa.factorId);
              else
                setError(
                  "This account has no two-factor factor yet. Set it up from a fresh install.",
                );
            })
          }
        />
      )}
    </AuthCard>
  );
}
