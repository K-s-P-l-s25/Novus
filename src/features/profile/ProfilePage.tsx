import { EmptyState, RoomPage } from "../../components/RoomPage";

export function ProfilePage() {
  return (
    <RoomPage title="Profile">
      <EmptyState
        title="Not signed in"
        body="Your account, two-factor authentication and devices appear here after sign-in (M3)."
      />
    </RoomPage>
  );
}
