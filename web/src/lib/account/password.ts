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

/** The complaint to show, or null if the pair is fine. */
export function checkPassword(next: string, confirm: string): string | null {
  if (next.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (next !== confirm) return "Those two passwords don't match.";
  return null;
}
