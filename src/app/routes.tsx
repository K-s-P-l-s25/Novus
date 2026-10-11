import type { RouteObject } from "react-router";
import { AppShell } from "./AppShell";
import { GatehousePage } from "../features/gatehouse/GatehousePage";
import { VaultsPage } from "../features/vaults/VaultsPage";
import { LibraryPage } from "../features/library/LibraryPage";
import { CraftPage } from "../features/craft/CraftPage";
import { JourneyPage } from "../features/journey/JourneyPage";
import { ShopPage } from "../features/shop/ShopPage";
import { ProfilePage } from "../features/profile/ProfilePage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { MorePage } from "../features/settings/MorePage";
import { RequireState, RequireUnlocked } from "../features/auth/RequireUnlocked";
import { SetupWizard } from "../features/auth/SetupWizard";
import { UnlockPage } from "../features/auth/UnlockPage";
import { RecoverPage } from "../features/auth/RecoverPage";
import { AuthPage } from "../features/auth/AuthPage";
import { NotFoundPage } from "../features/system/NotFoundPage";

// Routes per SPEC §14.1.
export const routes: RouteObject[] = [
  {
    element: (
      <RequireUnlocked>
        <AppShell />
      </RequireUnlocked>
    ),
    children: [
      { index: true, element: <GatehousePage /> },
      { path: "vaults", element: <VaultsPage /> },
      { path: "library/:vaultId", element: <LibraryPage /> },
      { path: "library/:vaultId/f/:fileId", element: <LibraryPage /> },
      { path: "craft", element: <CraftPage /> },
      { path: "craft/:templateId", element: <CraftPage /> },
      { path: "journey", element: <JourneyPage /> },
      { path: "shop", element: <ShopPage /> },
      { path: "profile", element: <ProfilePage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "settings/:section", element: <SettingsPage /> },
      { path: "more", element: <MorePage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
  {
    path: "setup",
    element: (
      <RequireState when="no-keys">
        <SetupWizard />
      </RequireState>
    ),
  },
  {
    path: "unlock",
    element: (
      <RequireState when="locked">
        <UnlockPage />
      </RequireState>
    ),
  },
  {
    path: "recover",
    element: (
      <RequireState when="locked">
        <RecoverPage />
      </RequireState>
    ),
  },
  {
    path: "auth",
    element: (
      <RequireUnlocked>
        <AuthPage />
      </RequireUnlocked>
    ),
  },
];
