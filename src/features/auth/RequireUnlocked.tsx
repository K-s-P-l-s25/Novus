import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { ipc } from "../../lib/ipc";
import { KEYS_STATUS_KEY } from "./keysFlow";

export function useKeysStatus() {
  return useQuery({
    queryKey: KEYS_STATUS_KEY,
    queryFn: ipc.keysStatus,
    staleTime: Infinity,
    retry: false,
  });
}

/** Rooms need unlocked keys: first run goes to /setup, a locked app to /unlock (SPEC §4.3). */
export function RequireUnlocked({ children }: { children: ReactNode }) {
  const status = useKeysStatus();
  const location = useLocation();
  if (status.isPending) return <Splash />;
  if (status.isError) return <Navigate to="/unlock" replace />;
  if (!status.data.has_keys) return <Navigate to="/setup" replace />;
  if (!status.data.unlocked)
    return <Navigate to="/unlock" replace state={{ from: location.pathname + location.search }} />;
  return children;
}

/** System pages: /setup only before keys exist, /unlock and /recover only while locked. */
export function RequireState({
  when,
  children,
}: {
  when: "no-keys" | "locked";
  children: ReactNode;
}) {
  const status = useKeysStatus();
  const from = (useLocation().state as { from?: string } | null)?.from ?? "/";
  if (status.isPending) return <Splash />;
  const s = status.data ?? { has_keys: false, unlocked: false };
  // Once unlocked, go back to the room that sent us here.
  if (s.unlocked) return <Navigate to={from} replace />;
  if (when === "no-keys" && s.has_keys) return <Navigate to="/unlock" replace state={{ from }} />;
  if (when === "locked" && !s.has_keys) return <Navigate to="/setup" replace />;
  return children;
}

function Splash() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg text-muted" aria-busy="true">
      <span className="text-xs font-bold tracking-[0.3em] text-accent">KAISEN</span>
    </main>
  );
}
