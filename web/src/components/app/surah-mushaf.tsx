import { getCachedPageWords } from "@/lib/reference/cached";
import { fromRow, groupIntoPages } from "@/lib/quran/mushaf";
import type { PageRange } from "@/lib/quran/page-within";
import { spreadHeat } from "@/lib/hifz/heat-spread";
import type { MistakeRow } from "@/lib/hifz/mistakes";
import { HeatViewer } from "./heat-viewer";
import { MushafPager } from "./mushaf-pager";
import type { SurahNames } from "./mushaf-reader";

/**
 * One printed page, tinted by the mistakes given, turning only within
 * `range` — the pages one surah occupies. Read-only: tapping a hot word
 * lists what went wrong there. The page is a whole printed page, so a
 * neighbouring surah's words show too; only this surah's mistakes are
 * passed in, so only its words can be hot.
 */
export async function SurahMushaf({
  page, range, mistakes, basePath, surahNames,
}: {
  page: number;
  range: PageRange;
  mistakes: MistakeRow[];
  basePath: string;
  surahNames?: SurahNames;
}) {
  const rows = await getCachedPageWords(page);
  const words = rows.map(fromRow);
  const { heat, history } = spreadHeat(words, mistakes, new Date());
  return (
    <MushafPager page={page} min={range.from} max={range.to} basePath={basePath} param="p">
      <HeatViewer pages={groupIntoPages(words)} heat={heat} history={history} surahNames={surahNames} />
    </MushafPager>
  );
}
