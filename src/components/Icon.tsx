// Minimal inline icon set (no icon library on the allow-list). Stroke uses currentColor.
const PATHS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  library: "M4 4h5v16H4zM10 4h5v16h-5zM16.5 4.5l3.8 1 -3.6 15-3.8-1z",
  craft: "M14 4l6 6-3 3-6-6zM11 7l-8 8 3 3 8-8M7 17l-3 3",
  journey: "M5 21V4M5 4h11l-2 4 2 4H5",
  shop: "M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2",
  profile: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13a7.5 7.5 0 0 0 0-2l2-1.5-2-3.5-2.4 1a7 7 0 0 0-1.7-1L15 3.5h-4L10.7 6a7 7 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7.5 7.5 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a7 7 0 0 0 1.7 1l.3 2.5h4l.3-2.5a7 7 0 0 0 1.7-1l2.4 1 2-3.5z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  lock: "M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === "more" ? 3 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ?? "size-6"}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
