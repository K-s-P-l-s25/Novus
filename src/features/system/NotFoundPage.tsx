import { Link } from "react-router";
import { EmptyState, RoomPage } from "../../components/RoomPage";

export function NotFoundPage() {
  return (
    <RoomPage title="Not found">
      <EmptyState
        title="This page doesn't exist"
        body="The link may be from a newer version of KAISEN."
        action={
          <Link
            to="/"
            className="inline-flex min-h-12 items-center rounded-card bg-accent px-5 text-accent-fg"
          >
            Go to the Gatehouse
          </Link>
        }
      />
    </RoomPage>
  );
}
