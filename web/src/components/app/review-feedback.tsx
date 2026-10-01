import Link from "next/link";
import { feedbackFor } from "@/lib/hifz/review-queries";
import { aggregateFlags, aggregatePatterns } from "@/lib/hifz/mistakes";
import { spreadHeat } from "@/lib/hifz/heat-spread";
import {
  getCachedPageWords, getCachedSurahs, getCachedSurahStartPages,
} from "@/lib/reference/cached";
import { fromRow, groupIntoPages } from "@/lib/quran/mushaf";
import { PatternTracker } from "./pattern-tracker";
import { HeatViewer } from "./heat-viewer";
import { MushafPager } from "./mushaf-pager";
import type { SurahNames } from "./mushaf-reader";
import { cn } from "@/lib/utils";

const LAST_PAGE = 604;
/**
 * Al-Mulk's first page, and the first page with a deployed QCF font.
 * `quran_words` now holds earlier pages too, but without their font they
 * render as blank or boxed text, so the pager never goes below this.
 */
const FIRST_FONT_PAGE = 562;

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
    const pages = groupIntoPages(words);
    const onPage = new Set(rows.map((r) => r.surah_number));

    const { heat: heatValues, history } = spreadHeat(words, mistakes, now);
    heatBlock = (
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Mistake heatmap</h3>
        <div className="flex flex-wrap gap-1.5">
          {heatSurahs.map((n) => (
            <Link key={n} href={`${basePath}&heat=${startPages[n] ?? firstPage}`}
              className={cn(
                "rounded-md border border-line px-2 py-1 text-xs transition-colors",
                onPage.has(n) ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              )}>
              {nameOf.get(n) ?? n} · {counts.get(n)}
            </Link>
          ))}
        </div>
        <MushafPager page={page} min={firstPage} max={LAST_PAGE} basePath={basePath} param="heat">
          <HeatViewer pages={pages} heat={heatValues} history={history} surahNames={surahNames} />
        </MushafPager>
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
