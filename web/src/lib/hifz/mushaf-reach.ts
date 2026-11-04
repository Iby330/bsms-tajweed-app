import { EARLIER_SURAHS } from "@/lib/quran/earlier-surahs";

/** Al-Mulk's first page, where the programme's mushaf begins. */
export const PROGRAMME_FIRST_PAGE = 562;

/** The full mushaf is for the ustadhs. Everyone else keeps the programme's range,
 *  even though the words and fonts for the rest are now on the server. */
export function hasFullMushaf(section: string | null | undefined): boolean {
  return section === "ustadhs";
}

export function firstReadablePage(section: string | null | undefined): number {
  return hasFullMushaf(section) ? 1 : PROGRAMME_FIRST_PAGE;
}

type SurahName = { number: number; name_en: string; name_ar: string };

/** Every surah in mushaf order: the `surahs` table's rows, and the earlier ones
 *  it deliberately doesn't hold. */
export function fullMushafSurahs<S extends SurahName>(table: S[]): SurahName[] {
  const held = new Set(table.map((s) => s.number));
  return [...EARLIER_SURAHS.filter((s) => !held.has(s.number)), ...table]
    .map(({ number, name_en, name_ar }) => ({ number, name_en, name_ar }))
    .sort((a, b) => a.number - b.number);
}

/** The page a surah opens on, or null when this viewer's mushaf doesn't reach it. */
export function surahPageForViewer(
  surah: number,
  startPages: Record<number, number>,
  section: string | null | undefined,
): number | null {
  const page = startPages[surah];
  return page !== undefined && page >= firstReadablePage(section) ? page : null;
}
