import { EmptyState, RoomPage } from "../../components/RoomPage";
import { TabBar, useTab, type TabDef } from "../../components/Tabs";

type JourneyTab = "quests" | "timeline" | "analytics";
const TABS: readonly TabDef<JourneyTab>[] = [
  { id: "quests", label: "Quests" },
  { id: "timeline", label: "Timeline" },
  { id: "analytics", label: "Analytics" },
];

const EMPTY: Record<JourneyTab, { title: string; body: string }> = {
  quests: { title: "No quests yet", body: "Main and side quests arrive in M8." },
  timeline: {
    title: "Your timeline is empty",
    body: "Completed and upcoming quests will line up here (M10).",
  },
  analytics: { title: "No data yet", body: "Charts appear once you complete quests (M10)." },
};

export function JourneyPage() {
  const [tab, setTab] = useTab(TABS);
  return (
    <RoomPage title="Journey">
      <TabBar label="Journey" tabs={TABS} current={tab} onSelect={setTab} />
      <EmptyState {...EMPTY[tab]} />
    </RoomPage>
  );
}
