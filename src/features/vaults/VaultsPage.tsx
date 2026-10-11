import { EmptyState, RoomPage } from "../../components/RoomPage";

export function VaultsPage() {
  return (
    <RoomPage title="Vaults">
      <EmptyState
        title="No vaults yet"
        body="Vaults hold your notes, boards and code. Creating vaults arrives with the Library (M6)."
      />
    </RoomPage>
  );
}
