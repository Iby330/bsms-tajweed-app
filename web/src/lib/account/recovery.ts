/**
 * A recovery link signs someone in. That is the whole point of it, and also
 * the danger: from the app's side, a person who followed a reset email and a
 * person sitting at an already-unlocked device look identical — both just have
 * a session.
 *
 * So /auth/confirm stamps this cookie when, and only when, the session was
 * minted by a `type=recovery` token, and /reset-password refuses to set a
 * password without it. Changing a password from inside the app goes through
 * /account instead, which asks for the current one. Without this split, anyone
 * who found a logged-in phone could take the account over without ever knowing
 * the old password.
 *
 * httpOnly, so the page can't fake it from script; short-lived, so a stale tab
 * left open on the reset screen doesn't stay a standing invitation.
 */
export const RECOVERY_COOKIE = "bsms-recovery";

/** Long enough to choose a password, short enough not to linger. */
export const RECOVERY_MAX_AGE = 15 * 60;
