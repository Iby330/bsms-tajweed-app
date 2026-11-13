import { getCachedPageWords } from "@/lib/reference/cached";
import { fromRow, groupIntoPages } from "@/lib/quran/mushaf";
import type { PageRange } from "@/lib/quran/page-within";
import { spreadHeat } from "@/lib/hifz/heat-spread";
import type { MistakeRow } from "@/lib/hifz/mistakes";
import { LiveHeatMushaf } from "./live-heat-mushaf";
import type { SurahNames } from "./mushaf-reader";

/**
 * One printed page, tinted by the mistakes given, turning anywhere within
 * `range` — the stretch of the mushaf this reader can open. Read-only:
 * tapping a hot word lists what went wrong there. Pass every mark the
 * student has, not one surah's: the page is a whole printed page, and a
 * neighbouring surah's mistakes on it belong on it too. Turns in the
 * browser; the marks go along so each page is tinted there as it is here.
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
    <LiveHeatMushaf
      page={page} min={range.from} max={range.to} basePath={basePath} param="p"
      pages={groupIntoPages(words)} heat={heat} history={history} surahNames={surahNames}
      tint={mistakes}
    />
  );
}
