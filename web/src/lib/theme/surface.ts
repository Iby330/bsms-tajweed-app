/**
 * Which screens are pinned to the dark scheme, whatever the viewer's device
 * prefers.
 *
 * The signed-out screens are the programme's shop window — the splash, the
 * application form, and the auth pages between them. They are seen once, by
 * someone who has never seen the app, and what they look like should be a
 * decision we made rather than one their laptop made at sunrise. So they are
 * always the deep navy the logo is drawn on.
 *
 * The signed-in app is deliberately NOT in here. Students are in it daily and
 * at night, the rail carries a theme toggle, and taking that away to make a
 * marketing point would be a poor trade.
 *
 * The auth pages earn their place for a second reason: the splash is dark and
 * "Sign in" leads straight to /login. Leaving that one page on the system
 * scheme would flash white in the middle of the only journey a new student
 * makes.
 */
export const DARK_ONLY_PATHS: readonly string[] = [
  "/",
  "/apply",
  "/login",
  "/locked",
  "/forgot-password",
  "/reset-password",
  "/welcome",
];

export function isDarkOnlyPath(pathname: string): boolean {
  return DARK_ONLY_PATHS.includes(pathname);
}

/**
 * How the proxy tells the root layout which kind of screen this is.
 *
 * The layout renders `<html>` and so has to know BEFORE it renders — but it
 * is a server component with no access to the route. The proxy has the
 * pathname already, so it sets this on the request and the layout reads it
 * back out of `headers()`. Doing it this way is what makes the dark class
 * server-rendered: decide it on the client and the page paints light first,
 * which is precisely the flash this exists to avoid.
 */
export const SURFACE_HEADER = "x-bsms-surface";
