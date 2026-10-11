import { errorMessage, isAppError } from "../../lib/errors";

/** Content-free error text for the auth screens. Server messages are not shown verbatim. */
export function authErrorMessage(
  e: unknown,
  context: "signin" | "totp" | "network" | "keys",
): string {
  if (isAppError(e)) return errorMessage(e);
  const status =
    typeof e === "object" && e !== null && "status" in e ? Number(e.status) : undefined;
  if (
    status === undefined ||
    status === 0 ||
    (e instanceof TypeError && /fetch/i.test(e.message))
  ) {
    return "Can't reach the server. Check your connection and try again.";
  }
  switch (context) {
    case "signin":
      return "Sign-in failed. Check your email and password.";
    case "totp":
      return "That code didn't work. Codes change every 30 seconds; check your device's clock.";
    default:
      return "Something went wrong. Try again.";
  }
}
