import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import type { Database } from "@/lib/database.types";
import { SEAT_COOKIE, seatHeaders, validSeat } from "./seat";

/**
 * Server-component / server-action client (anon key + user session).
 *
 * Acts as the session's seat when it has one. `asLogin` ignores the seat, for
 * the few things that belong to the login itself: account details and the check
 * that a seat is theirs to switch to.
 */
export async function supabaseServer(opts: { asLogin?: boolean } = {}) {
  const store = await cookies();
  const seat = opts.asLogin ? null : validSeat(store.get(SEAT_COOKIE)?.value);
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: seatHeaders(seat) },
      cookies: {
        getAll: () => store.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              store.set(name, value, options),
            );
          } catch {
            // called from a Server Component — proxy refresh handles it
          }
        },
      },
    },
  );
}

/**
 * Current user's profile row, or null if signed out / no profile. Throws when
 * the read itself fails.
 *
 * Wrapped in `cache()` because a single render asks for this repeatedly — the
 * role layout, the page, and helpers like teacher scope each call it — and
 * without dedupe that was three auth verifies and three profile reads for one
 * screen. React memoises per request, so it is now one of each per render
 * pass; a server action runs in its own pass and gets its own fresh read,
 * which is what you want after a mutation.
 *
 * `getClaims()` verifies the JWT locally against the project's cached JWKS
 * instead of asking the Auth server who this is; `sub` is the user id.
 *
 * `classes(name)` rides along on the same round trip because Home needs the
 * class *name* for the leaderboards helper, not just `class_id` — fetching it
 * separately would be a second query for one string. Classes are readable by
 * any signed-in user, so the embed widens no visibility. The FK hint is not
 * optional: profiles and classes are joined by two FKs (class_id, and
 * classes.teacher_id back at profiles), and without it PostgREST refuses the
 * ambiguous embed at runtime — an error tsc cannot see.
 *
 * With a seat cookie this is the seat's row, so layouts and pages treat the
 * person as that class's student. A stale cookie finds no row (it must name a
 * seat this login owns) and falls through to their own profile.
 */
export const currentProfile = cache(async () => {
  const supabase = await supabaseServer();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;
  if (!userId) return null;
  const seat = validSeat((await cookies()).get(SEAT_COOKIE)?.value);
  if (seat) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, role, section, class_id, is_active, is_admin, avatar_url, setup_complete, unlock_all, login_id, classes!profiles_class_id_fkey(name)")
      .eq("id", seat)
      .eq("login_id", userId)
      .maybeSingle();
    if (error) throw new Error(`Couldn't load your profile: ${error.message}`);
    if (data) return data;
  }
  // `maybeSingle`, and a thrown error: a missing row and a failed read used to
  // both come back null, so a dropped connection was handled as "no profile"
  // and redirected. Now only a genuinely absent row is null, and a failure
  // reaches the nearest error boundary, where Try again can recover it.
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, section, class_id, is_active, is_admin, avatar_url, setup_complete, unlock_all, login_id, classes!profiles_class_id_fkey(name)")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`Couldn't load your profile: ${error.message}`);
  return data;
});
