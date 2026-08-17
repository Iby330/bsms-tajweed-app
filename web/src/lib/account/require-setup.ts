import "server-only";
import { redirect } from "next/navigation";

/**
 * Send anyone who has not chosen a password back to finish doing so.
 *
 * An invitation link signs the teacher in AND shows the setup form, which
 * means the session outlives the form: close the page and you are logged in
 * with a password nobody knows, unable to fix it from /account because
 * changing a password there verifies the current one by signing in with it.
 *
 * Checking on every page load is what makes closing the page harmless — they
 * simply get asked again. It costs nothing extra: `setup_complete` rides along
 * on the profile row the layout has already fetched.
 *
 * Safe against a redirect loop by construction: /welcome sits in the (auth)
 * route group, which has no layout of its own and so never calls this.
 */
export function requireSetup(profile: { setup_complete: boolean }) {
  if (!profile.setup_complete) redirect("/welcome");
}
