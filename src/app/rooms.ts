// The rooms of the app shell (SPEC §14.1) and how they appear in navigation (§11.2).
import type { IconName } from "../components/Icon";

export type RoomId =
  "gatehouse" | "library" | "craft" | "journey" | "shop" | "profile" | "settings";

export interface Room {
  id: RoomId;
  label: string;
  /** Where the nav item goes. The Library is entered through vault selection. */
  path: string;
  /** Route prefixes that count as "inside" this room, for the active state. */
  match: readonly string[];
  icon: IconName;
  /** Shown in the mobile bottom tabs; the rest live under "More". */
  mobileTab: boolean;
  /** nav.<id> shortcut (SPEC §27.4). */
  accelerator: string;
}

export const ROOMS: readonly Room[] = [
  {
    id: "gatehouse",
    label: "Gatehouse",
    path: "/",
    match: ["/"],
    icon: "home",
    mobileTab: true,
    accelerator: "Ctrl+1",
  },
  {
    id: "library",
    label: "Library",
    path: "/vaults",
    match: ["/vaults", "/library"],
    icon: "library",
    mobileTab: true,
    accelerator: "Ctrl+2",
  },
  {
    id: "craft",
    label: "Craft Room",
    path: "/craft",
    match: ["/craft"],
    icon: "craft",
    mobileTab: false,
    accelerator: "Ctrl+3",
  },
  {
    id: "journey",
    label: "Journey",
    path: "/journey",
    match: ["/journey"],
    icon: "journey",
    mobileTab: true,
    accelerator: "Ctrl+4",
  },
  {
    id: "shop",
    label: "Shop",
    path: "/shop",
    match: ["/shop"],
    icon: "shop",
    mobileTab: true,
    accelerator: "Ctrl+5",
  },
  {
    id: "profile",
    label: "Profile",
    path: "/profile",
    match: ["/profile"],
    icon: "profile",
    mobileTab: false,
    accelerator: "Ctrl+6",
  },
  {
    id: "settings",
    label: "Settings",
    path: "/settings",
    match: ["/settings"],
    icon: "settings",
    mobileTab: false,
    accelerator: "Ctrl+7",
  },
];

export function isRoomActive(room: Room, pathname: string): boolean {
  return room.match.some((m) =>
    m === "/" ? pathname === "/" : pathname === m || pathname.startsWith(`${m}/`),
  );
}
