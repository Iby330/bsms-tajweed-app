import "server-only";
import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Reference data — the three tables that are the same for everybody.
 *
 * Terms, weeks and surahs are the calendar and the surah index: readable by
 * ANY authenticated user under RLS. That is the only reason one cache entry
 * can be shared across users — nobody can see a row here that somebody else
 * couldn't. The reads go through the service-role client, which bypasses RLS
 * entirely, so this module must NEVER grow entries for `lessons` or
 * `homeworks` (a student's view of those is unlock-gated) or `questions`
 * (they carry answer keys). A cached row from those tables would be handed to
 * whichever user asked next.
 *
 * The seeds are the only writer, and they run outside the app — after seeding
 * they can POST /api/revalidate to drop the "reference" tag. `revalidate` is
 * the safety net for when nobody remembers to.
 */

export const getCachedTerms = unstable_cache(
  async () => {
    const { data, error } = await supabaseAdmin()
      .from("terms")
      .select("id, starts_on, ends_on, exam_max")
      .order("id");
    // Throw rather than fall back to []: an empty array caches for the hour
    // and every screen silently loses its calendar.
    if (error) throw error;
    return data ?? [];
  },
  ["ref-terms"],
  { tags: ["reference"], revalidate: 3600 },
);

export const getCachedWeeks = unstable_cache(
  async () => {
    const { data, error } = await supabaseAdmin()
      .from("weeks")
      .select("id, term_id, number, unlock_at")
      .order("term_id")
      .order("number");
    if (error) throw error;
    return data ?? [];
  },
  ["ref-weeks"],
  { tags: ["reference"], revalidate: 3600 },
);

export const getCachedSurahs = unstable_cache(
  async () => {
    const { data, error } = await supabaseAdmin()
      .from("surahs")
      .select("number, order_index, name_ar, name_en")
      .order("order_index");
    if (error) throw error;
    return data ?? [];
  },
  ["ref-surahs"],
  { tags: ["reference"], revalidate: 3600 },
);

export const getCachedSurahWords = unstable_cache(
  async (surahNumber: number) => {
    const { data, error } = await supabaseAdmin()
      .from("quran_words")
      .select("surah_number, ayah_number, word_position, text_uthmani, code_v1, code_v2, is_end, page_number, line_number")
      .eq("surah_number", surahNumber)
      .order("ayah_number")
      .order("word_position");
    if (error) throw error;
    return data ?? [];
  },
  // key carries the row shape — bumped when the select gains code_v1, so a
  // deploy never serves hour-old rows missing the new column
  ["ref-quran-words-v3"],
  { tags: ["reference"], revalidate: 3600 },
);

/** One full mushaf page — every surah on it, in reading order. */
export const getCachedPageWords = unstable_cache(
  async (pageNumber: number) => {
    const { data, error } = await supabaseAdmin()
      .from("quran_words")
      .select("surah_number, ayah_number, word_position, text_uthmani, code_v1, code_v2, is_end, page_number, line_number")
      .eq("page_number", pageNumber)
      .order("surah_number")
      .order("ayah_number")
      .order("word_position");
    if (error) throw error;
    return data ?? [];
  },
  // v2: rows re-seeded from the by_page feed — page-boundary words were
  // mis-filed before (79:16 under p583); the key bump drops stale copies
  ["ref-quran-page-words-v3"],
  { tags: ["reference"], revalidate: 3600 },
);

/** Where each seeded surah begins in the mushaf: surah → page. */
export const getCachedSurahStartPages = unstable_cache(
  async () => {
    const { data, error } = await supabaseAdmin()
      .from("quran_words")
      .select("surah_number, page_number")
      .eq("ayah_number", 1)
      .eq("word_position", 1);
    if (error) throw error;
    return Object.fromEntries((data ?? []).map((r) => [r.surah_number, r.page_number])) as Record<number, number>;
  },
  ["ref-surah-start-pages"],
  { tags: ["reference"], revalidate: 3600 },
);
