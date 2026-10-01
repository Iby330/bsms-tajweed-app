import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import { NO_PROFILE_ERROR } from "@/lib/no-profile";

/**
 * Where a role layout sends a session it found no profile for. See
 * lib/no-profile.ts for why this is a route and not a redirect to /login.
 *
 * It re-checks before signing anyone out, so it is not a general logout link:
 * a crafted <img src="/auth/no-profile"> on another site does nothing to a
 * person whose profile is there.
 */
export async function GET(request: NextRequest) {
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url));

  // Held and written onto the redirect by hand, as /auth/confirm does.
  const pending: { name: string; value: string; options: CookieOptions }[] = [];
  const supabase = createServerClient<Database>(
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

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;
  if (!userId) return to("/login");

  // A failed read is not evidence the row is missing. /home will show the
  // error page if the failure persists, which is better than a sign-out.
  const { data: profile, error } = await supabase
    .from("profiles").select("id").eq("id", userId).maybeSingle();
  if (error || profile) return to("/home");

  // Local scope: this browser's session only.
  await supabase.auth.signOut({ scope: "local" });

  const response = to(`/login?error=${NO_PROFILE_ERROR}`);
  for (const { name, value, options } of pending) {
    response.cookies.set(name, value, options);
  }
  // signOut keeps the session when the Auth server can't be reached, and a
  // session left behind is what the proxy bounces off /login. Expire the
  // Supabase cookies here regardless, so this always ends signed out.
  for (const { name } of request.cookies.getAll()) {
    if (name.startsWith("sb-")) response.cookies.delete(name);
  }
  return response;
}
