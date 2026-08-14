import "server-only";
import data from "./surah-detail.json";

/**
 * The full introduction to each surah — every section the source gives, in
 * order, untruncated.
 *
 * `server-only` is the point of this module. The prose runs to ~300 KB; it
 * belongs on the surah page and must never be pulled into a client component,
 * where it would land in the browser bundle. The short summaries in
 * `surah-info.ts` are what the index and the overview use.
 *
 * Regenerate with: python3 execution/fetch_surah_info.py
 *
 * The text is Sayyid Abul A'la Maududi's Tafhim al-Qur'an, served by the
 * Quran.com API. `source` must be rendered wherever any of this is shown.
 */

export type SurahSection = { heading: string; text: string };
export type SurahDetail = {
  sections: SurahSection[];
  /** Any note the source puts before its first heading — including the one
   *  saying an introduction covers two surahs at once. */
  lead: string;
  source: string;
};

const DETAIL = data as Record<string, SurahDetail>;

export function surahDetail(number: number): SurahDetail | null {
  return DETAIL[String(number)] ?? null;
}
