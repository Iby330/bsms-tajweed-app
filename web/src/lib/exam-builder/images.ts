import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import type { McqOption } from "./types";

const BUCKET = "exam-questions";
/** Long enough for a teacher to build a paper in one sitting without pictures going dead. */
const TTL_SECONDS = 2 * 60 * 60;
/** Paths per createSignedUrls call: keeps each request body modest. */
const BATCH = 200;

/**
 * Signed URLs for pictures in the private exam-questions bucket, path → URL.
 *
 * Signs as the caller (their own `supabaseServer()` client): the bucket's
 * read policy lets every teacher in and nobody else, so a student session gets
 * nothing back. Deliberately a plain server function, not an action: the
 * paths only ever come from rows the caller could already read.
 *
 * Duplicates are signed once; a path that fails (missing object, bad batch)
 * is left out, and the component shows "Picture missing" in its place.
 */
export async function signExamImages(paths: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter((p) => typeof p === "string" && p))];
  if (unique.length === 0) return {};
  const db = await supabaseServer();
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += BATCH) batches.push(unique.slice(i, i + BATCH));

  const results = await Promise.all(
    batches.map(async (batch) => {
      try {
        const { data, error } = await db.storage.from(BUCKET).createSignedUrls(batch, TTL_SECONDS);
        return error || !data ? [] : data;
      } catch {
        return [];
      }
    }),
  );

  const out: Record<string, string> = {};
  for (const row of results.flat()) {
    if (row.path && row.signedUrl && !row.error) out[row.path] = row.signedUrl;
  }
  return out;
}

/** Every picture a question shows: its prompt pictures, then its options' pictures, each once. */
export function collectImagePaths(q: { prompt_images: string[]; options: McqOption[] | null }): string[] {
  const all = [...(q.prompt_images ?? []), ...(q.options ?? []).flatMap((o) => (o.image ? [o.image] : []))];
  return [...new Set(all)];
}
