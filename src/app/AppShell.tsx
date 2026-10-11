// Adaptive shell (SPEC §11.2): desktop (≥ 768 px) left rail + content;
// mobile single column + bottom tabs with "More".
import { Link, Outlet, useLocation } from "react-router";
import { Icon } from "../components/Icon";
import { cn } from "../lib/cn";
import { DESKTOP_QUERY, useMediaQuery } from "./useMediaQuery";
import { useNavActions } from "./useNavActions";
import { ROOMS, isRoomActive, type Room } from "./rooms";

export function AppShell() {
  const desktop = useMediaQuery(DESKTOP_QUERY);
  useNavActions();
  return desktop ? (
    <div className="flex h-dvh bg-bg text-text">
      <DesktopRail />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  ) : (
    <div className="flex h-dvh flex-col bg-bg text-text">
      <main className="flex-1 overflow-y-auto pt-[env(safe-area-inset-top)]">
        <Outlet />
      </main>
      <MobileTabs />
    </div>
  );
}

function DesktopRail() {
  const { pathname } = useLocation();
  return (
    <nav
      aria-label="Rooms"
      className="flex w-20 shrink-0 flex-col items-center gap-1 border-r border-border bg-surface py-4"
    >
      <span className="mb-4 text-xs font-bold tracking-[0.2em] text-accent">KAISEN</span>
      {ROOMS.map((room) => (
        <RailLink key={room.id} room={room} active={isRoomActive(room, pathname)} />
      ))}
    </nav>
  );
}

function RailLink({ room, active }: { room: Room; active: boolean }) {
  return (
    <Link
      to={room.path}
      aria-current={active ? "page" : undefined}
      title={`${room.label} (${room.accelerator})`}
      className={cn(
        "flex min-h-14 w-16 flex-col items-center justify-center gap-1 rounded-card text-[0.7rem] text-muted transition-colors hover:bg-elevated hover:text-text",
        active && "bg-elevated text-accent",
      )}
    >
      <Icon name={room.icon} />
      <span>{room.label.split(" ")[0]}</span>
    </Link>
  );
}

function MobileTabs() {
  const { pathname } = useLocation();
  const tabs = ROOMS.filter((r) => r.mobileTab);
  const moreActive =
    pathname === "/more" || ROOMS.some((r) => !r.mobileTab && isRoomActive(r, pathname));
  return (
    <nav
      aria-label="Rooms"
      className="grid grid-cols-5 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      {tabs.map((room) => (
        <TabLink
          key={room.id}
          to={room.path}
          label={room.label}
          icon={room.icon}
          active={isRoomActive(room, pathname)}
        />
      ))}
      <TabLink to="/more" label="More" icon="more" active={moreActive} />
    </nav>
  );
}

function TabLink({
  to,
  label,
  icon,
  active,
}: {
  to: string;
  label: string;
  icon: Room["icon"];
  active: boolean;
}) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.7rem] text-muted",
        active && "text-accent",
      )}
    >
      <Icon name={icon} />
      <span>{label}</span>
    </Link>
  );
}
