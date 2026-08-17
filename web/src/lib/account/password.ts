/**
 * Password rules, in one place so the browser and the server agree.
 *
 * The client runs these for instant feedback; the server runs them again
 * because the client's copy is a courtesy, not a control. Supabase enforces
 * its own project-level minimum underneath both — this floor is deliberately
 * at or above it, so a password that passes here is never bounced later with
 * a message the student can't act on.
 */
export const MIN_PASSWORD_LENGTH = 8;

export type PasswordResult = { ok: true } | { ok: false; message: string };

/**
 * Supabase's own words are written for developers ("New password should be
 * different from the old password."), and some of them leak internals. These
 * are the two the person can actually do something about; anything else becomes
 * a plain apology rather than a raw error string on screen.
 *
 * Shared by every path that sets a password — /account and the setup form both.
 * Setup used to answer "Try a longer one" to everything, which is a wrong
 * instruction for the one case a new teacher can genuinely hit: typing the
 * temporary password they just signed in with as their new one.
 */
export function humanisePasswordError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("different from the old password")) {
    return "That's already your password — pick a new one.";
  }
  if (m.includes("password should be") || m.includes("weak")) {
    return "That password is too weak. Try a longer one.";
  }
  return "Something went wrong updating your password. Try again.";
}

/** The complaint to show, or null if the pair is fine. */
export function checkPassword(next: string, confirm: string): string | null {
  if (next.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (next !== confirm) return "Those two passwords don't match.";
  return null;
}
