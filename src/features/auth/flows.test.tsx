import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { createFakeBackend, GOOD_PASS, RECOVERY, ROW } from "../../test/fakeBackend";
import { renderAt } from "../../test/renderApp";
import { setViewport } from "../../test/setup";
import { resetSessionStoreForTests } from "../../lib/sessionStore";

const backend = vi.hoisted(() => ({
  current: null as null | ReturnType<typeof createFakeBackend>,
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) => backend.current?.invoke(cmd, args),
}));

const sb = vi.hoisted(() => ({
  configured: false,
  signIn: vi.fn(),
  mfaState: vi.fn(),
  enrolTotp: vi.fn(),
  verifyTotp: vi.fn(),
  fetchUserKeys: vi.fn(),
  uploadUserKeys: vi.fn(),
}));
vi.mock("../../lib/supabase", () => ({
  getSupabase: () => (sb.configured ? {} : null),
  signIn: sb.signIn,
  mfaState: sb.mfaState,
  enrolTotp: sb.enrolTotp,
  verifyTotp: sb.verifyTotp,
  fetchUserKeys: sb.fetchUserKeys,
  uploadUserKeys: sb.uploadUserKeys,
}));

const type = (label: RegExp | string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const click = (name: RegExp | string) => fireEvent.click(screen.getByRole("button", { name }));

async function confirmRecoveryKey() {
  await screen.findByTestId("recovery-key");
  fireEvent.click(screen.getByRole("checkbox"));
  type(/last group/, RECOVERY.split("-").at(-1) ?? "");
  click("Continue");
}

beforeEach(() => {
  setViewport(1280);
  resetSessionStoreForTests();
  sb.configured = false;
  for (const f of [
    sb.signIn,
    sb.mfaState,
    sb.enrolTotp,
    sb.verifyTotp,
    sb.fetchUserKeys,
    sb.uploadUserKeys,
  ]) {
    f.mockReset();
  }
});

describe("unlock (daily use, SPEC §4.3)", () => {
  it("redirects a locked app to /unlock and returns to the room after unlock, with no network", async () => {
    backend.current = createFakeBackend({ has_keys: true, unlocked: false });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { router } = renderAt("/journey");
    await screen.findByRole("heading", { name: "Unlock" });

    type("Master passphrase", "wrong passphrase");
    click("Unlock");
    expect((await screen.findByRole("alert")).textContent).toContain("not correct");

    type("Master passphrase", GOOD_PASS);
    click("Unlock");
    await screen.findByRole("heading", { name: "Journey" });
    expect(router.state.location.pathname).toBe("/journey");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("recovers a forgotten passphrase and sets a new one", async () => {
    backend.current = createFakeBackend({ has_keys: true, unlocked: false });
    renderAt("/recover");
    await screen.findByRole("heading", { name: "Recover" });
    type("Recovery key", RECOVERY.toLowerCase());
    click("Unlock");
    await screen.findByRole("heading", { name: "Choose a new passphrase" });
    type("Master passphrase", "velvet quarry nimbus harbor tidal");
    type("Confirm passphrase", "velvet quarry nimbus harbor tidal");
    click("Save and continue");
    await screen.findByRole("heading", { name: "Gatehouse" });
    expect(backend.current.calls.map((c) => c.cmd)).toContain("keys_set_passphrase");
  });
});

describe("first run without Supabase (local-only build)", () => {
  it("creates a passphrase, shows the recovery key once and opens the Gatehouse", async () => {
    backend.current = createFakeBackend({ has_keys: false, unlocked: false });
    renderAt("/");
    await screen.findByRole("heading", { name: "Create your master passphrase" });
    expect(screen.getByText(/runs on this device only/)).toBeTruthy();

    type("Master passphrase", GOOD_PASS);
    type("Confirm passphrase", "different");
    expect(screen.getByRole("alert").textContent).toContain("don't match");
    type("Confirm passphrase", GOOD_PASS);
    click("Create passphrase");

    await screen.findByRole("heading", { name: "Save your recovery key" });
    expect(screen.getByRole("button", { name: "Continue" }).hasAttribute("disabled")).toBe(true);
    await confirmRecoveryKey();
    await screen.findByRole("heading", { name: "Gatehouse" });
    expect(backend.current.calls.find((c) => c.cmd === "keys_bootstrap")?.args).toEqual({
      passphrase: GOOD_PASS,
    });
  });
});

describe("first run with Supabase", () => {
  beforeEach(() => {
    sb.configured = true;
  });

  it("first device: sign in → enrol TOTP → create keys → upload user_keys → recovery key", async () => {
    backend.current = createFakeBackend({ has_keys: false, unlocked: false });
    sb.signIn.mockResolvedValue(undefined);
    sb.mfaState.mockResolvedValue({ state: "none", factorId: null });
    sb.enrolTotp.mockResolvedValue({
      factorId: "f1",
      qrCode: "data:image/svg+xml;utf8,<svg/>",
      secret: "JBSWY3DP",
      uri: "otpauth://x",
    });
    sb.verifyTotp.mockResolvedValue(undefined);
    sb.fetchUserKeys.mockResolvedValue(null);
    sb.uploadUserKeys.mockResolvedValue(undefined);

    renderAt("/setup");
    await screen.findByRole("heading", { name: "Sign in" });
    type("Email", "me@example.com");
    type("Password", "account password");
    click("Sign in");

    await screen.findByRole("heading", { name: "Set up two-factor authentication" });
    expect(screen.getByAltText(/QR code/)).toBeTruthy();
    expect(screen.getByTestId("totp-secret").textContent).toBe("JBSWY3DP");
    type(/6-digit code/, "123 456");
    click("Verify");
    await waitFor(() => expect(sb.verifyTotp).toHaveBeenCalledWith("f1", "123456"));

    await screen.findByRole("heading", { name: "Create your master passphrase" });
    type("Master passphrase", GOOD_PASS);
    type("Confirm passphrase", GOOD_PASS);
    click("Create passphrase");
    await screen.findByRole("heading", { name: "Save your recovery key" });
    expect(sb.uploadUserKeys).toHaveBeenCalledWith(ROW);
    await confirmRecoveryKey();
    await screen.findByRole("heading", { name: "Gatehouse" });
  });

  it("new device: sign in → TOTP → existing user_keys → unlock with passphrase", async () => {
    backend.current = createFakeBackend({ has_keys: false, unlocked: false });
    sb.signIn.mockResolvedValue(undefined);
    sb.mfaState.mockResolvedValue({ state: "enrolled", factorId: "f1" });
    sb.verifyTotp.mockResolvedValue(undefined);
    sb.fetchUserKeys.mockResolvedValue(ROW);

    renderAt("/setup");
    await screen.findByRole("heading", { name: "Sign in" });
    type("Email", "me@example.com");
    type("Password", "account password");
    click("Sign in");
    await screen.findByRole("heading", { name: "Two-factor code" });
    expect(sb.enrolTotp).not.toHaveBeenCalled();
    type(/6-digit code/, "654321");
    click("Verify");

    await screen.findByRole("heading", { name: "Unlock your data" });
    type("Master passphrase", GOOD_PASS);
    click("Unlock");
    await screen.findByRole("heading", { name: "Gatehouse" });
    const unlock = backend.current.calls.find((c) => c.cmd === "keys_unlock");
    expect(unlock?.args).toEqual({ passphrase: GOOD_PASS, userKeysRow: ROW });
  });

  it("shows a content-free error on a bad TOTP code", async () => {
    backend.current = createFakeBackend({ has_keys: false, unlocked: false });
    sb.signIn.mockResolvedValue(undefined);
    sb.mfaState.mockResolvedValue({ state: "enrolled", factorId: "f1" });
    sb.verifyTotp.mockRejectedValue({ status: 422, message: "Invalid TOTP code entered" });
    renderAt("/setup");
    await screen.findByRole("heading", { name: "Sign in" });
    type("Email", "me@example.com");
    type("Password", "x");
    click("Sign in");
    await screen.findByRole("heading", { name: "Two-factor code" });
    type(/6-digit code/, "000000");
    click("Verify");
    expect((await screen.findByRole("alert")).textContent).toContain("didn't work");
  });

  it("keeps the key row for a later upload when the upload fails", async () => {
    backend.current = createFakeBackend({ has_keys: false, unlocked: false });
    sb.signIn.mockResolvedValue(undefined);
    sb.mfaState.mockResolvedValue({ state: "verified", factorId: "f1" });
    sb.fetchUserKeys.mockResolvedValue(null);
    sb.uploadUserKeys.mockRejectedValue(new TypeError("Failed to fetch"));
    renderAt("/setup");
    await screen.findByRole("heading", { name: "Sign in" });
    type("Email", "me@example.com");
    type("Password", "x");
    click("Sign in");
    await screen.findByRole("heading", { name: "Create your master passphrase" });
    type("Master passphrase", GOOD_PASS);
    type("Confirm passphrase", GOOD_PASS);
    click("Create passphrase");
    await screen.findByRole("heading", { name: "Save your recovery key" });
    expect(JSON.parse(backend.current.state.kv.get("kaisen.user_keys.pending") ?? "null")).toEqual(
      ROW,
    );
  });
});
