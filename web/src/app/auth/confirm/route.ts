import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { RECOVERY_COOKIE, RECOVERY_MAX_AGE } from "@/lib/account/recovery";

/**
 * Where the link in a Supabase auth email lands.
 *
 * The email carries a `token_hash`, which this handler trades for a session
 * server-side via `verifyOtp`. The alternative — letting the browser complete
 * a PKCE exchange — needs the code verifier that was stashed in the
 * *requesting* browser's storage, so it breaks in the single most common case
 * there is: asking for the link on a laptop and opening the mail on a phone.
 * A token hash carries no such baggage; any device can redeem it.
 *
 * Cookies are written onto the redirect response by hand rather than through
 * `cookies()`. The session cookies Supabase mints here and the redirect are
 * one and the same response, and doing it explicitly is the version that
 * cannot silently drop them.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const next = params.get("next");

  // Only ever an in-app path — `next` arrives from an email, which is to say
  // from anywhere, and following it blindly would make this an open redirect.
  const safeNext =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/home";

  const fail = () =>
    NextResponse.redirect(new URL("/forgot-password?error=link", request.url));

  if (!tokenHash || !type) return fail();

  // Held until the outcome is known: the redirect target depends on it, and a
  // NextResponse has to be built with its destination already decided.
  const pending: { name: string; value: string; options: CookieOptions }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          pending.push(...cookiesToSet);
        },
      },
    },
  );

  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return fail();

  const response = NextResponse.redirect(new URL(safeNext, request.url));
  for (const { name, value, options } of pending) {
    response.cookies.set(name, value, options);
  }

  // See lib/account/recovery.ts — this is what tells /reset-password that the
  // session behind it came from an email, not from an unattended device.
  if (type === "recovery") {
    response.cookies.set(RECOVERY_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: RECOVERY_MAX_AGE,
    });
  }

  return response;
}
