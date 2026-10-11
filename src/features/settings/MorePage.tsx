import { Link } from "react-router";
import { RoomPage } from "../../components/RoomPage";
import { Icon } from "../../components/Icon";
import { ROOMS } from "../../app/rooms";
import { actions } from "../../lib/actions";

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
        <li>
          <button
            type="button"
            onClick={() => void actions.run("lock.now")}
            className="flex min-h-14 w-full items-center gap-4 rounded-card bg-surface px-4 text-left"
          >
            <Icon name="lock" />
            <span className="font-medium">Lock now</span>
          </button>
        </li>
      </ul>
    </RoomPage>
  );
}
