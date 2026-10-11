import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { EmptyState, RoomPage } from "../../components/RoomPage";
import { actions } from "../../lib/actions";
import { currentEmail, getSupabase } from "../../lib/supabase";

export function ProfilePage() {
  const configured = getSupabase() !== null;
  const email = useQuery({
    queryKey: ["account_email"],
    queryFn: currentEmail,
    enabled: configured,
    retry: false,
  });
  return (
    <RoomPage title="Profile">
      <section className="flex flex-col gap-3 rounded-card bg-surface p-5">
        <h2 className="text-lg font-medium">Account</h2>
        {!configured ? (
          <p className="text-muted">
            This build runs on this device only (no Supabase project configured).
          </p>
        ) : email.data ? (
          <p>
            Signed in as <strong>{email.data}</strong>
          </p>
        ) : (
          <p className="text-muted">
            Not signed in. Your data stays available offline;{" "}
            <Link to="/auth" className="text-accent underline">
              sign in
            </Link>{" "}
            to resume sync.
          </p>
        )}
        <button
          type="button"
          onClick={() => void actions.run("lock.now")}
          className="inline-flex min-h-12 w-fit items-center rounded-card border border-border px-5"
        >
          Lock now (Ctrl+L)
        </button>
      </section>
      <EmptyState
        title="More coming"
        body="Two-factor factors, passphrase and recovery key management, and your devices arrive with the Profile milestone."
      />
    </RoomPage>
  );
}
