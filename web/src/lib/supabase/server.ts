import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import type { Database } from "@/lib/database.types";

/** Server-component / server-action client (anon key + user session). */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
 * Current user's profile row, or null if signed out / no profile.
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
 */
export const currentProfile = cache(async () => {
  const supabase = await supabaseServer();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;
  if (!userId) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, role, section, class_id, is_active, avatar_url, classes!profiles_class_id_fkey(name)")
    .eq("id", userId)
    .single();
  return data;
});
