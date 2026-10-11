import { Link } from "react-router";
import { EmptyState, RoomPage } from "../../components/RoomPage";

export function GatehousePage() {
  return (
    <RoomPage title="Gatehouse">
      <EmptyState
        title="Nothing here yet"
        body="Today's quests, pinned templates and recent files will gather here as KAISEN grows."
        action={
          <Link
            to="/vaults"
            className="inline-flex min-h-12 items-center rounded-card bg-accent px-5 font-medium text-accent-fg"
          >
            Open the Library
          </Link>
        }
      />
    </RoomPage>
  );
}
