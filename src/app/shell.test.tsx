import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryRouter } from "react-router";
import { routes } from "./routes";
import { ROOMS } from "./rooms";
import { setViewport } from "../test/setup";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => {
    if (cmd === "app_info") {
      return {
        version: "0.1.0",
        schema_version: 0,
        payload_v: 1,
        platform: "windows",
        device_id: null,
      };
    }
    throw { kind: "NotFound" };
  }),
}));

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

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
  "/setup": "Set up KAISEN",
  "/auth": "Sign in",
  "/unlock": "Unlock",
  "/recover": "Recover",
};

describe("every route renders its room", () => {
  for (const [path, heading] of Object.entries(HEADINGS)) {
    it(path, () => {
      setViewport(1280);
      renderAt(path);
      expect(screen.getByRole("heading", { level: 1, name: heading })).toBeTruthy();
    });
  }
});

describe("desktop shell", () => {
  it("shows a rail with every room and marks the active one", () => {
    setViewport(1024);
    renderAt("/journey?tab=timeline");
    const nav = screen.getByRole("navigation", { name: "Rooms" });
    expect(within(nav).getAllByRole("link")).toHaveLength(ROOMS.length);
    expect(within(nav).getByRole("link", { current: "page" }).getAttribute("href")).toBe(
      "/journey",
    );
    expect(screen.getByRole("tab", { name: "Timeline", selected: true })).toBeTruthy();
  });

  it("navigates with the rail", () => {
    setViewport(1024);
    const router = renderAt("/");
    fireEvent.click(within(screen.getByRole("navigation", { name: "Rooms" })).getByTitle(/^Shop/));
    expect(router.state.location.pathname).toBe("/shop");
    // Inventory is the first and default tab.
    expect(screen.getByRole("tab", { name: "Inventory", selected: true })).toBeTruthy();
  });

  it("Ctrl+1 … Ctrl+7 jump between rooms", () => {
    setViewport(1024);
    const router = renderAt("/");
    ROOMS.forEach((room, i) => {
      act(() => {
        fireEvent.keyDown(window, { key: String(i + 1), ctrlKey: true });
      });
      expect(router.state.location.pathname).toBe(room.path);
    });
  });
});

describe("mobile shell", () => {
  it("shows four room tabs plus More, with touch-size targets", () => {
    setViewport(390);
    renderAt("/");
    const nav = screen.getByRole("navigation", { name: "Rooms" });
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

  it("More lists the remaining rooms and marks More active inside them", () => {
    setViewport(390);
    renderAt("/more");
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
