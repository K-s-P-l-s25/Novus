import { EmptyState, RoomPage } from "../../components/RoomPage";
import { TabBar, useTab, type TabDef } from "../../components/Tabs";

type ShopTab = "inventory" | "shop";
// Inventory is the first tab (SPEC §24.1).
const TABS: readonly TabDef<ShopTab>[] = [
  { id: "inventory", label: "Inventory" },
  { id: "shop", label: "Shop" },
];

export function ShopPage() {
  const [tab, setTab] = useTab(TABS);
  return (
    <RoomPage title="Shop & Inventory">
      <TabBar label="Shop" tabs={TABS} current={tab} onSelect={setTab} />
      {tab === "inventory" ? (
        <EmptyState
          title="Your bag is empty"
          body="Visit the shop once you've earned gold from quests (M9)."
        />
      ) : (
        <EmptyState
          title="The shop is empty"
          body="Create your own rewards to buy with quest gold (M9)."
        />
      )}
    </RoomPage>
  );
}
