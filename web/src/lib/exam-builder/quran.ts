import "server-only";
import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fromRow, type QuranWordRow } from "@/lib/quran/mushaf";
import { ayahSpans, isQuranRef, sliceRef, snippetKey, type SnippetWord } from "./quran-lines";
import type { QuranRef } from "./types";

/**
 * The words for a paper's typeset ayahs, keyed by `snippetKey(ref)`.
 *
 * `quran_words` is readable by any signed-in user under RLS
 * (s_quran_words_read, 0013), so a teacher could read it directly — but it is
 * the same public Qur'an text for everyone, which is exactly the case
 * lib/reference/cached.ts serves through the service role and a shared
 * cross-request cache. This follows it, keyed by the ayah span asked for
 * (not the whole surah: Al-Baqarah is ~6,400 words, past PostgREST's
 * 1,000-row page). Only teachers reach this (the print page's layout and the
 * builder's route both check), and the mushaf-reach limit on students does
 * not apply to them: a teacher's mushaf is the whole of it.
 */

const SELECT = "surah_number, ayah_number, word_position, text_uthmani, code_v1, code_v2, is_end, page_number, line_number";
const PAGE = 1000;

const getSpanRows = unstable_cache(
  async (surah: number, from: number, to: number): Promise<QuranWordRow[]> => {
    const rows: QuranWordRow[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabaseAdmin()
        .from("quran_words")
        .select(SELECT)
        .eq("surah_number", surah)
        .gte("ayah_number", from)
        .lte("ayah_number", to)
        .order("ayah_number")
        .order("word_position")
        .range(offset, offset + PAGE - 1);
      // Throw rather than cache an empty passage for the hour.
      if (error) throw error;
      rows.push(...((data ?? []) as QuranWordRow[]));
      if (!data || data.length < PAGE) break;
    }
    return rows;
  },
  ["exam-quran-span-v1"],
  { tags: ["reference"], revalidate: 3600 },
);

export async function loadQuranSnippets(refs: (QuranRef | null | undefined)[]): Promise<Record<string, SnippetWord[]>> {
  const valid = refs.filter(isQuranRef);
  const unique = [...new Map(valid.map((r) => [snippetKey(r), r])).values()];
  if (unique.length === 0) return {};
  const spans = await Promise.all(ayahSpans(unique).map((s) => getSpanRows(s.surah, s.from, s.to)));
  const words = spans.flat().map(fromRow);
  const out: Record<string, SnippetWord[]> = {};
  for (const ref of unique) {
    const slice = sliceRef(words, ref);
    if (slice.length > 0) out[snippetKey(ref)] = slice;
  }
  return out;
}
