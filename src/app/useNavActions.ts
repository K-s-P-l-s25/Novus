import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { lockNow } from "../features/auth/keysFlow";
import { actions } from "../lib/actions";
import { ROOMS } from "./rooms";

/** Registers nav.<room> actions (Ctrl+1 … Ctrl+7), lock.now (Ctrl+L) and dispatches key presses. */
export function useNavActions(): void {
  const navigate = useNavigate();
  const client = useQueryClient();

  useEffect(
    () =>
      actions.register({
        id: "lock.now",
        title: "Lock KAISEN",
        group: "Security",
        defaultAccelerator: "Ctrl+L",
        run: () => lockNow(client),
      }),
    [client],
  );

  useEffect(() => {
    const unregister = ROOMS.map((room) =>
      actions.register({
        id: `nav.${room.id}`,
        title: `Go to ${room.label}`,
        group: "Navigation",
        defaultAccelerator: room.accelerator,
        run: () => {
          void navigate(room.path);
        },
      }),
    );
    return () => unregister.forEach((u) => u());
  }, [navigate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return;
      const action = actions.forKey(e);
      if (!action) return;
      e.preventDefault();
      void actions.run(action.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
