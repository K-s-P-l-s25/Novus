import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { createFakeBackend } from "../test/fakeBackend";
import { renderAt } from "../test/renderApp";
import { ROOMS } from "./rooms";
import { setViewport } from "../test/setup";

const backend = vi.hoisted(() => ({
  current: null as null | ReturnType<typeof createFakeBackend>,
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) => backend.current?.invoke(cmd, args),
}));

beforeEach(() => {
  backend.current = createFakeBackend({ has_keys: true, unlocked: true });
});

const HEADINGS: Record<string, string> = {
  "/": "Gatehouse",
  "/vaults": "Vaults",
  "/library/v1": "Library",
  "/library/v1/f/f1": "Library",
  "/craft": "Craft Room",
  "/craft/t1": "Craft Room",
  "/journey": "Journey",
  "/shop": "Shop & Inventory",
  "/profile": "Profile",
  "/settings": "Settings",
  "/settings/about": "About",
  "/more": "More",
  "/does-not-exist": "Not found",
};

describe("every route renders its room", () => {
  for (const [path, heading] of Object.entries(HEADINGS)) {
    it(path, async () => {
      setViewport(1280);
      renderAt(path);
      expect(await screen.findByRole("heading", { level: 1, name: heading })).toBeTruthy();
    });
  }
});

describe("desktop shell", () => {
  it("shows a rail with every room and marks the active one", async () => {
    setViewport(1024);
    renderAt("/journey?tab=timeline");
    const nav = await screen.findByRole("navigation", { name: "Rooms" });
    expect(within(nav).getAllByRole("link")).toHaveLength(ROOMS.length);
    expect(within(nav).getByRole("button", { name: /Lock/ })).toBeTruthy();
    expect(within(nav).getByRole("link", { current: "page" }).getAttribute("href")).toBe(
      "/journey",
    );
    expect(screen.getByRole("tab", { name: "Timeline", selected: true })).toBeTruthy();
  });

  it("navigates with the rail", async () => {
    setViewport(1024);
    const { router } = renderAt("/");
    fireEvent.click(
      within(await screen.findByRole("navigation", { name: "Rooms" })).getByTitle(/^Shop/),
    );
    expect(router.state.location.pathname).toBe("/shop");
    // Inventory is the first and default tab.
    expect(screen.getByRole("tab", { name: "Inventory", selected: true })).toBeTruthy();
  });

  it("Ctrl+1 … Ctrl+7 jump between rooms", async () => {
    setViewport(1024);
    const { router } = renderAt("/");
    await screen.findByRole("navigation", { name: "Rooms" });
    ROOMS.forEach((room, i) => {
      act(() => {
        fireEvent.keyDown(window, { key: String(i + 1), ctrlKey: true });
      });
      expect(router.state.location.pathname).toBe(room.path);
    });
  });
});

describe("mobile shell", () => {
  it("shows four room tabs plus More, with touch-size targets", async () => {
    setViewport(390);
    renderAt("/");
    const nav = await screen.findByRole("navigation", { name: "Rooms" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([
      "Gatehouse",
      "Library",
      "Journey",
      "Shop",
      "More",
    ]);
    for (const l of links) expect(l.className).toContain("min-h-14");
  });

  it("More lists the remaining rooms and marks More active inside them", async () => {
    setViewport(390);
    renderAt("/more");
    await screen.findByRole("heading", { name: "More" });
    expect(screen.getAllByRole("link").map((l) => l.textContent)).toEqual(
      expect.arrayContaining(["Craft Room", "Profile", "Settings"]),
    );
  });
});

describe("Settings → About", () => {
  it("shows app_info from Rust", async () => {
    setViewport(1280);
    renderAt("/settings/about");
    const about = await screen.findByTestId("about");
    expect(about.textContent).toContain("0.1.0");
    expect(about.textContent).toContain("windows");
    expect(about.textContent).toContain("Not created yet");
  });
});

describe("lock", () => {
  it("Ctrl+L locks and the guard sends you to the unlock screen", async () => {
    setViewport(1024);
    renderAt("/journey");
    await screen.findByRole("heading", { name: "Journey" });
    act(() => {
      fireEvent.keyDown(window, { key: "l", ctrlKey: true });
    });
    expect(await screen.findByRole("heading", { name: "Unlock" })).toBeTruthy();
    await waitFor(() => expect(backend.current?.state.unlocked).toBe(false));
  });
});
