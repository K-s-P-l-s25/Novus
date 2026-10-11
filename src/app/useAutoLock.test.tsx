import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BACKGROUND_LOCK_MS, IDLE_LOCK_MS, useAutoLock } from "./useAutoLock";

const invoke = vi.hoisted(() => vi.fn(async () => null));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

function Harness() {
  useAutoLock();
  return null;
}
const mount = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Harness />
    </QueryClientProvider>,
  );
const setUA = (ua: string) =>
  Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
const setVisibility = (v: "hidden" | "visible") => {
  Object.defineProperty(document, "visibilityState", { value: v, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
};

beforeEach(() => {
  vi.useFakeTimers();
  invoke.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("auto-lock (SPEC §4.5)", () => {
  it("desktop: locks after 15 minutes idle, activity resets the timer", async () => {
    setUA("Mozilla/5.0 (Windows NT 10.0)");
    mount();
    await act(() => vi.advanceTimersByTimeAsync(IDLE_LOCK_MS - 1000));
    window.dispatchEvent(new Event("keydown"));
    await act(() => vi.advanceTimersByTimeAsync(IDLE_LOCK_MS - 1000));
    expect(invoke).not.toHaveBeenCalledWith("keys_lock", undefined);
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(invoke).toHaveBeenCalledWith("keys_lock", undefined);
  });

  it("android: locks 5 minutes after going to the background, and on return if timers were frozen", async () => {
    setUA("Mozilla/5.0 (Linux; Android 14)");
    mount();
    await act(() => vi.advanceTimersByTimeAsync(IDLE_LOCK_MS * 2));
    expect(invoke).not.toHaveBeenCalled();
    act(() => setVisibility("hidden"));
    await act(() => vi.advanceTimersByTimeAsync(BACKGROUND_LOCK_MS));
    expect(invoke).toHaveBeenCalledWith("keys_lock", undefined);

    invoke.mockClear();
    act(() => setVisibility("visible"));
    act(() => setVisibility("hidden"));
    vi.setSystemTime(Date.now() + BACKGROUND_LOCK_MS + 1);
    act(() => setVisibility("visible"));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(invoke).toHaveBeenCalledWith("keys_lock", undefined);
  });
});
