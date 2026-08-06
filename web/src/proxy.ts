import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Runs before every page request. Two jobs:
 *
 *  1. REFRESH THE SESSION. Supabase access tokens are short-lived. Without a
 *     refresh here, a signed-in user silently expires and gets bounced to the
 *     login screen mid-session. Calling `getUser()` rotates the refresh token
 *     and writes the new pair back as cookies, so people stay signed in across
 *     days and browser restarts — they open the app and they're just in.
 *
 *  2. Optimistic route gating. This is a fast redirect only, NOT the security
 *     boundary — the real check is `currentProfile()` in each role layout, and
 *     RLS underneath that. Proxy never queries the database (see the Next docs:
 *     proxy is not for data fetching), so it knows *whether* someone is signed
 *     in but not their role. Signed-in users all land on /home; the student
 *     layout forwards teachers on to /teacher/home.
 */

/** Reachable signed out. Everything else requires a session. */
const PUBLIC_PATHS = ["/", "/login", "/locked"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Must be reassigned (not recreated) whenever Supabase sets cookies, and
  // returned as-is — building a fresh response would drop the refreshed tokens
  // and log the user out on the next request.
  let response = NextResponse.next({ request });

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
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic = PUBLIC_PATHS.includes(pathname);

  // Signed out on a protected page — send to login, remembering where they were
  // headed so the deep link survives the detour.
  if (!user && !isPublic) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = pathname === "/home" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(login);
  }

  // Already signed in — skip the landing and login screens entirely. This is
  // what makes returning to the app feel like it just opens.
  if (user && (pathname === "/" || pathname === "/login")) {
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
     */
    "/((?!_next/static|_next/image|favicon.ico|icon.png|brand/|fonts/|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|otf)$).*)",
  ],
};
