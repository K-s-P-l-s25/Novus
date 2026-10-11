import { useEffect, useState } from "react";
import type { PassphraseStrength } from "../../types/generated/PassphraseStrength";
import type { StrengthHint } from "../../types/generated/StrengthHint";
import { ipc } from "../../lib/ipc";
import { cn } from "../../lib/cn";

const LABELS = ["Very weak", "Weak", "Fair", "Strong", "Very strong"] as const;

export const HINT_TEXT: Record<StrengthHint, string> = {
  TooShort: "Use at least 12 characters.",
  CommonPassword: "This is a very common password.",
  RepeatedCharacters: "Avoid repeated characters.",
  Sequence: "Avoid sequences like abc, 123 or qwerty.",
  SingleCharacterType: "Mix letters with numbers or symbols, or use several words.",
  AddAnotherWord: "Add another word or two.",
};

/** Live strength estimate from Rust (★ S12). The passphrase is never stored here. */
export function PassphraseStrengthMeter({ passphrase }: { passphrase: string }) {
  // The estimate is tagged with the input it belongs to, so a stale answer never shows.
  const [result, setResult] = useState<{ input: string; strength: PassphraseStrength } | null>(
    null,
  );

  useEffect(() => {
    if (!passphrase) return;
    let cancelled = false;
    const t = setTimeout(() => {
      ipc
        .keysPassphraseStrength(passphrase)
        .then((strength) => {
          if (!cancelled) setResult({ input: passphrase, strength });
        })
        .catch(() => undefined);
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [passphrase]);

  const strength = result?.input === passphrase ? result.strength : null;
  if (!passphrase || !strength) return null;
  const label = LABELS[Math.min(4, Math.max(0, strength.score))];
  return (
    <div className="flex flex-col gap-2" aria-live="polite" data-testid="strength">
      <div className="flex gap-1" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full bg-border",
              i < strength.score && (strength.acceptable ? "bg-success" : "bg-danger"),
            )}
          />
        ))}
      </div>
      <p className="text-sm">
        <span className={strength.acceptable ? "text-success" : "text-danger"}>{label}</span>
        <span className="text-muted">
          {" "}
          · {strength.acceptable ? "good enough for your master passphrase" : "not accepted yet"}
        </span>
      </p>
      {strength.hints.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-muted">
          {strength.hints.map((h) => (
            <li key={h}>{HINT_TEXT[h]}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
