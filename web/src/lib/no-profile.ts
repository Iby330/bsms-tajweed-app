/**
 * A session with no profile row behind it — an Auth user created by hand, or a
 * profile deleted while its owner was signed in.
 *
 * The role layouts can't render one, and sending it to /login looped: the
 * proxy bounces a signed-in visitor off /login to /home, whose layout sent
 * them back, until the browser gave up with ERR_TOO_MANY_REDIRECTS. The
 * layouts send it here instead; this route signs it out (a route handler can
 * write cookies, a layout can't) and lands on /login with a reason.
 */
export const NO_PROFILE_PATH = "/auth/no-profile";

/** The `?error=` value /login reads to say why it is showing. */
export const NO_PROFILE_ERROR = "no-profile";
