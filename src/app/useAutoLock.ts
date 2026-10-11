import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { lockNow } from "../features/auth/keysFlow";

/** SPEC §4.5 defaults (configurable in M15): 15 min idle on desktop, 5 min in background on Android. */
export const IDLE_LOCK_MS = 15 * 60_000;
export const BACKGROUND_LOCK_MS = 5 * 60_000;

const isAndroid = () => /android/i.test(navigator.userAgent);

export function useAutoLock(): void {
  const client = useQueryClient();

  useEffect(() => {
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let backgroundTimer: ReturnType<typeof setTimeout> | undefined;
    let hiddenAt: number | null = null;
    const lock = () => void lockNow(client).catch(() => undefined);

    const resetIdle = () => {
      if (isAndroid()) return;
      clearTimeout(idleTimer);
      idleTimer = setTimeout(lock, IDLE_LOCK_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        if (isAndroid()) backgroundTimer = setTimeout(lock, BACKGROUND_LOCK_MS);
      } else {
        clearTimeout(backgroundTimer);
        // Timers may not run while Android has the app in the background: check on return.
        if (isAndroid() && hiddenAt !== null && Date.now() - hiddenAt >= BACKGROUND_LOCK_MS) lock();
        hiddenAt = null;
        resetIdle();
      }
    };

    const activity = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;
    for (const ev of activity) window.addEventListener(ev, resetIdle, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    resetIdle();
    return () => {
      clearTimeout(idleTimer);
      clearTimeout(backgroundTimer);
      for (const ev of activity) window.removeEventListener(ev, resetIdle);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [client]);
}
