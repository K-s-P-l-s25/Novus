import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PassphraseStrengthMeter } from "./PassphraseStrengthMeter";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

describe("PassphraseStrengthMeter", () => {
  it("renders nothing for an empty passphrase", () => {
    const { container } = render(<PassphraseStrengthMeter passphrase="" />);
    expect(container.textContent).toBe("");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("shows the score and hints from Rust", async () => {
    invoke.mockResolvedValueOnce({
      score: 0,
      bits: 9,
      acceptable: false,
      hints: ["TooShort", "CommonPassword"],
    });
    render(<PassphraseStrengthMeter passphrase="hunter2" />);
    const meter = await screen.findByTestId("strength");
    expect(invoke).toHaveBeenCalledWith("keys_passphrase_strength", { passphrase: "hunter2" });
    expect(meter.textContent).toContain("Very weak");
    expect(meter.textContent).toContain("not accepted yet");
    expect(meter.textContent).toContain("at least 12 characters");
    expect(meter.textContent).toContain("very common password");
  });

  it("marks acceptable passphrases", async () => {
    invoke.mockResolvedValueOnce({ score: 4, bits: 64, acceptable: true, hints: [] });
    render(<PassphraseStrengthMeter passphrase="orbit lantern pebble justice marrow" />);
    expect((await screen.findByTestId("strength")).textContent).toContain("good enough");
  });
});
