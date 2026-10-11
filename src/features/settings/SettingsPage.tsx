import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useParams } from "react-router";
import { EmptyState, RoomPage } from "../../components/RoomPage";
import { cn } from "../../lib/cn";
import { errorMessage, toAppError } from "../../lib/errors";
import { ipc } from "../../lib/ipc";
import { SETTINGS_SECTIONS } from "./sections";

export function SettingsPage() {
  const { section } = useParams();
  const current = SETTINGS_SECTIONS.find((s) => s.id === section);
  if (section && !current) return <Navigate to="/settings" replace />;

  return (
    <RoomPage title={current ? current.label : "Settings"}>
      <div className="flex flex-col gap-6 md:flex-row">
        <nav
          aria-label="Settings sections"
          className={cn("flex flex-col gap-1 md:w-56", current && "hidden md:flex")}
        >
          {SETTINGS_SECTIONS.map((s) => (
            <Link
              key={s.id}
              to={`/settings/${s.id}`}
              aria-current={s.id === current?.id ? "page" : undefined}
              className={cn(
                "flex min-h-12 items-center rounded-card px-4 text-muted hover:bg-surface hover:text-text",
                s.id === current?.id && "bg-surface text-text",
              )}
            >
              {s.label}
            </Link>
          ))}
        </nav>
        <div className="flex-1">
          {current?.id === "about" ? (
            <About />
          ) : current ? (
            <EmptyState title="Nothing to set yet" body="These settings arrive in M15." />
          ) : (
            <p className="hidden text-muted md:block">Choose a section.</p>
          )}
        </div>
      </div>
    </RoomPage>
  );
}

function About() {
  const info = useQuery({
    queryKey: ["app_info"],
    queryFn: ipc.appInfo,
    staleTime: Infinity,
    retry: false,
  });
  if (info.isPending) return <p className="text-muted">Loading…</p>;
  if (info.isError) return <p className="text-danger">{errorMessage(toAppError(info.error))}</p>;
  const rows: [string, string][] = [
    ["Version", info.data.version],
    ["Platform", info.data.platform],
    ["Schema version", String(info.data.schema_version)],
    ["Sync payload version", String(info.data.payload_v)],
    ["Device ID", info.data.device_id ?? "Not created yet"],
  ];
  return (
    <dl
      className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 rounded-card bg-surface p-5"
      data-testid="about"
    >
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
