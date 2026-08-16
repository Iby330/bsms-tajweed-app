import "server-only";
import { cache } from "react";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * How long a minted avatar URL stays good.
 *
 * Comfortably longer than any single page view, and short enough that a URL
 * copied out of the page markup stops working before it is worth sharing.
 */
const TTL_SECONDS = 60 * 60;

/**
 * A short-lived URL for a stored avatar.
 *
 * The bucket is private, so this is the only way to render one. It is
 * deliberately NOT a server action: as an action it would be a POST endpoint
 * that signs whatever path it is handed, which would let anyone mint a URL for
 * somebody else's picture just by guessing `<user id>/avatar.jpg`. Keeping it
 * a plain server function means the path only ever comes from a row the
 * caller was already allowed to read.
 *
 * Wrapped in `cache` so the rail and the page body sharing one avatar cost a
 * single round trip per request rather than two.
 */
export const signedAvatarUrl = cache(async (path: string | null) => {
  if (!path) return null;
  const db = await supabaseServer();
  const { data } = await db.storage.from("avatars").createSignedUrl(path, TTL_SECONDS);
  return data?.signedUrl ?? null;
});
