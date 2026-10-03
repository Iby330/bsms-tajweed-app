import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { RECOVERY_COOKIE, RECOVERY_MAX_AGE } from "@/lib/account/recovery";
import { safeNext } from "@/lib/safe-next";

/**
 * Where the Continue button on /auth/confirm posts the token from an email.
 *
 * POST only, never GET. University mail (Proofpoint, Mimecast and the like)
 * opens every link in a message to scan it. When the emailed link itself
 * redeemed the token, the scanner was the one signed in, seconds after
 * delivery, and the student's own click met "expired or already used" every
 * time. Scanners fetch links; they do not press buttons. So the link only
 * shows a page (../page.tsx), and the token is spent here, on the press.
 *
 * The form carries a `token_hash`, which this handler trades for a session
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
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const field = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" && value ? value : null;
  };
  const tokenHash = field("token_hash");
  const type = field("type") as EmailOtpType | null;
  // Only ever an in-app path — `next` arrives from an email, which is to say
  // from anywhere, and following it blindly would make this an open redirect.
  const next = safeNext(field("next"));

  // 303 on every way out: it turns the POST into a GET. The default 307 would
  // repeat the POST, form body and all, against the page it lands on.
  const fail = () =>
    NextResponse.redirect(new URL("/forgot-password?error=link", request.url), 303);

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

  const response = NextResponse.redirect(new URL(next, request.url), 303);
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
