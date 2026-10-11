import { Link } from "react-router";
import { RoomPage } from "../../components/RoomPage";
import { Icon } from "../../components/Icon";
import { ROOMS } from "../../app/rooms";

/** Mobile "More" tab: the rooms that don't fit in the bottom bar (SPEC §11.2). */
export function MorePage() {
  return (
    <RoomPage title="More">
      <ul className="flex flex-col gap-2">
        {ROOMS.filter((r) => !r.mobileTab).map((r) => (
          <li key={r.id}>
            <Link
              to={r.path}
              className="flex min-h-14 items-center gap-4 rounded-card bg-surface px-4"
            >
              <Icon name={r.icon} />
              <span className="font-medium">{r.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </RoomPage>
  );
}
