import { feedbackFor } from "@/lib/hifz/review-queries";
import { aggregateFlags, aggregatePatterns } from "@/lib/hifz/mistakes";
import { spreadHeat } from "@/lib/hifz/heat-spread";
import {
  getCachedPageWords, getCachedSurahs, getCachedSurahStartPages,
} from "@/lib/reference/cached";
import { fromRow, groupIntoPages } from "@/lib/quran/mushaf";
import { PatternTracker } from "./pattern-tracker";
import { LiveHeatMushaf } from "./live-heat-mushaf";
import type { SurahNames } from "./mushaf-reader";
import { LAST_PAGE } from "@/lib/quran/page-within";
import { PROGRAMME_FIRST_PAGE as FIRST_FONT_PAGE } from "@/lib/hifz/mushaf-reach";


/**
 * Submitted-review results for one student: pattern tracker and mushaf
 * heatmap. Sessions themselves are not listed here any more — the revision
 * activity grid on the overview already shows them day by day.
 * RLS behind feedbackFor decides who may look. The heatmap
 * is the same page-turning mushaf as the logger; surah chips jump to a
 * surah's opening page and the `heat` query param owns the shown page.
 * basePath already carries its tab query (and the logger's page, if any).
 */
export async function ReviewFeedback({
  studentId, heat, basePath,
}: {
  studentId: string;
  heat?: number;      // raw param — a surah number or a mushaf page
  basePath: string;
}) {
  const [{ sessions, mistakes }, surahs, startPages] = await Promise.all([
    feedbackFor(studentId),
    getCachedSurahs(),
    getCachedSurahStartPages(),
  ]);
  if (!sessions.length) {
    return (
      <p className="glass rounded-2xl p-6 text-sm text-muted-foreground">
        No submitted reviews yet.
      </p>
    );
  }

  const now = new Date();
  const patterns = aggregatePatterns(mistakes, now);
  const flags = aggregateFlags(sessions);
  const surahNames: SurahNames = Object.fromEntries(
    surahs.map((s) => [s.number, { ar: s.name_ar, en: s.name_en }]),
  );
  const firstPage = Math.max(FIRST_FONT_PAGE, Math.min(...Object.values(startPages)));

  const counts = new Map<number, number>();
  for (const m of mistakes) counts.set(m.surah_number, (counts.get(m.surah_number) ?? 0) + 1);
  const heatSurahs = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  const nameOf = new Map(surahs.map((s) => [s.number, s.name_en]));

  let heatBlock: React.ReactNode = null;
  if (heatSurahs.length) {
    // `heat` may name a surah (jump to its opening page) or a page itself.
    const page = Math.max(
      firstPage,
      heat && startPages[heat] !== undefined
        ? startPages[heat]
        : heat && Number.isInteger(heat) && heat >= firstPage && heat <= LAST_PAGE
          ? heat
          : startPages[heatSurahs[0]] ?? firstPage,
    );

    const rows = await getCachedPageWords(page);
    const words = rows.map(fromRow);
    const { heat: heatValues, history } = spreadHeat(words, mistakes, now);
    heatBlock = (
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Mistake heatmap</h3>
        {/* Turns in the browser, chips and arrows alike; `mistakes` goes
            along so each page is tinted there as it is here. */}
        <LiveHeatMushaf
          page={page} min={firstPage} max={LAST_PAGE} basePath={basePath}
          pages={groupIntoPages(words)} heat={heatValues} history={history}
          surahNames={surahNames} tint={mistakes}
          chips={heatSurahs.map((n) => ({
            surah: n,
            label: `${nameOf.get(n) ?? n} · ${counts.get(n)}`,
            page: Math.max(firstPage, startPages[n] ?? firstPage),
          }))}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PatternTracker patterns={patterns} flags={flags} />
      {heatBlock}
    </div>
  );
}
