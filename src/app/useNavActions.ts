import { useEffect } from "react";
import { useNavigate } from "react-router";
import { actions } from "../lib/actions";
import { ROOMS } from "./rooms";

/** Registers nav.<room> actions (Ctrl+1 … Ctrl+7) and dispatches global key presses. */
export function useNavActions(): void {
  const navigate = useNavigate();

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
