import { useParams } from "react-router";
import { EmptyState, RoomPage } from "../../components/RoomPage";

export function LibraryPage() {
  const { fileId } = useParams();
  return (
    <RoomPage title="Library">
      <EmptyState
        title={fileId ? "File not available yet" : "This vault is empty"}
        body="Notes, Codex snippets and Boards arrive in M6, M12 and M11."
      />
    </RoomPage>
  );
}
