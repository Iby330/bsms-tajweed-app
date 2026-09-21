import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SURFACE_HEADER, isDarkOnlyPath } from "@/lib/theme/surface";

/**
 * Runs before every page request. Two jobs:
 *
 *  1. REFRESH THE SESSION. Supabase access tokens are short-lived. Without a
 *     refresh here, a signed-in user silently expires and gets bounced to the
 *     login screen mid-session. `getClaims()` verifies the JWT locally against
 *     the project's asymmetric signing keys — the JWKS is fetched once per
 *     process and cached from then on, so there is no Auth-server round trip
 *     on the request path — and when the access token has actually expired it
 *     still refreshes it and writes the new pair back as cookies. People stay
 *     signed in across days and browser restarts; they open the app and
 *     they're just in.
 *
 *     The tradeoff, accepted knowingly: a local verify never asks the Auth
 *     server whether the session is still good, so a session revoked
 *     elsewhere keeps working here until its access token runs out — one
 *     token TTL, no longer.
 *
 *  2. Optimistic route gating. This is a fast redirect only, NOT the security
 *     boundary — the real check is `currentProfile()` in each role layout, and
 *     RLS underneath that. Proxy never queries the database (see the Next docs:
 *     proxy is not for data fetching), so it knows *whether* someone is signed
 *     in but not their role. Signed-in users all land on /home; the student
 *     layout forwards teachers on to /teacher/home.
 */

/**
 * Reachable signed out. Everything else requires a session.
 *
 * The password-reset paths have to be here, and /auth/confirm especially:
 * that is where the link in the email lands, carrying the token that creates
 * the session. Gate it and it would bounce every reset to /login *before*
 * redeeming the token — the flow could never complete.
 */
const PUBLIC_PATHS = [
  "/",
  "/apply",
  "/login",
  "/locked",
  "/forgot-password",
  "/reset-password",
  "/welcome",
  "/auth/confirm",
  /* A design surface, not a product route: the hero animation on its own so
     it can be opened and screenshotted while it is being worked on. It reads
     no data and shows nothing a signed-out visitor could not see on the
     landing page. */
  "/preview/hero",
  /* The landing page being designed, before it replaces the splash at "/".
     Same reasoning: it reads no data and says nothing a signed-out visitor
     would not read on the real landing page. It carries noindex, so it is
     reachable by link and by nothing else. */
  "/preview/landing",
  /* The shaped glyph geometry the hero animates, drawn flat. A build artifact
     made visible: no data, no text a visitor could not read in the mushaf.
     It is also the page a teacher reviews the rule marking on, which is a
     reason to keep it reachable without an account. */
  "/preview/geometry",
  /* The hero animation full-bleed, for tuning the motion. Same reasoning as
     the others: no data, nothing a signed-out visitor could not see on the
     landing page itself. */
  "/preview/ayah",
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /**
   * Every response carries the scheme decision down to the root layout, which
   * renders <html> and cannot see the route for itself.
   *
   * It is a function rather than a value because Supabase rebuilds the
   * response whenever it refreshes a token (see setAll below), and a header
   * set once on the first response would be dropped by that rebuild — the
   * layout would then render the app scheme on a signed-out page, at random,
   * only for the users whose session happened to refresh on that request.
   *
   * Headers are rebuilt from `request.headers` each time, AFTER Supabase has
   * written the refreshed cookies onto the request, so the new session still
   * reaches the server render.
   */
  const withSurface = () => {
    const headers = new Headers(request.headers);
    headers.set(SURFACE_HEADER, isDarkOnlyPath(pathname) ? "dark-only" : "app");
    return NextResponse.next({ request: { headers } });
  };

  // Must be reassigned (not recreated) whenever Supabase sets cookies, and
  // returned as-is — building a fresh response would drop the refreshed tokens
  // and log the user out on the next request.
  let response = withSurface();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = withSurface();
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;

  const isPublic = PUBLIC_PATHS.includes(pathname);

  // Signed out on a protected page — send to login, remembering where they were
  // headed so the deep link survives the detour.
  if (!claims && !isPublic) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = pathname === "/home" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(login);
  }

  // Already signed in — skip the landing and login screens entirely. This is
  // what makes returning to the app feel like it just opens.
  if (claims && (pathname === "/" || pathname === "/login")) {
    const home = request.nextUrl.clone();
    home.pathname = "/home";
    home.search = "";
    return NextResponse.redirect(home);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals and static assets. Without this the
     * proxy would run on every CSS, font and image request — an auth round
     * trip per asset.
     *
     * `webmanifest` earns its place: the browser fetches the manifest while
     * signed out, and without the exemption the proxy answers that fetch with
     * a redirect to /login. The browser then parses an HTML page as JSON,
     * fails, and drops the install prompt — with nothing on screen to say so.
     */
    "/((?!_next/static|_next/image|favicon.ico|brand/|fonts/|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|otf|webmanifest)$).*)",
  ],
};
