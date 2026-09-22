/**
 * Which screens are pinned to the dark scheme, whatever the viewer's device
 * prefers.
 *
 * ONLY THE SPLASH, since 2026-09-22. It is the one page whose colours are
 * written into the page itself (components/landing/LandingPage.tsx paints its
 * own navy ground and lavender ink rather than reading the tokens), so it has
 * no light version to offer and pinning it is honest.
 *
 * Everything else that used to be here — /apply, the auth screens — now
 * follows the device, because the advertising does. Every Instagram post is
 * lavender paper with navy ink, so a student tapping a light post from a
 * light phone was being dropped onto a dark form; the two now match. Both
 * schemes are the brand's own colours, swapped, which is the system rather
 * than an exception to it (docs/brand-system.md).
 *
 * The signed-in app was never in here: students are in it daily and at
 * night, and the rail carries a theme toggle.
 */
export const DARK_ONLY_PATHS: readonly string[] = ["/"];

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
