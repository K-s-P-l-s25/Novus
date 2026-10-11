import { EmptyState, RoomPage } from "../../components/RoomPage";

export function CraftPage() {
  return (
    <RoomPage title="Craft Room">
      <EmptyState
        title="No templates yet"
        body="Build reusable templates for notes, boards, code and quests (M14)."
      />
    </RoomPage>
  );
}
