// Settings categories (SPEC §27.3).
export const SETTINGS_SECTIONS = [
  { id: "appearance", label: "Appearance" },
  { id: "editor", label: "Editor" },
  { id: "shortcuts", label: "Keyboard shortcuts" },
  { id: "library", label: "Library and vaults" },
  { id: "quests", label: "Quests and shop" },
  { id: "sync", label: "Sync and storage" },
  { id: "security", label: "Security" },
  { id: "accessibility", label: "Accessibility" },
  { id: "data", label: "Data" },
  { id: "about", label: "About" },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];
