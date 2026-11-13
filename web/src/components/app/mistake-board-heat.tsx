"use client";

import type { MushafPage } from "@/lib/quran/mushaf";
import type { MistakeRow } from "@/lib/hifz/mistakes";
import type { WordHistoryEntry } from "@/lib/hifz/heat-spread";
import { HeatViewer } from "./heat-viewer";
import { MushafPager } from "./mushaf-pager";
import type { SurahNames } from "./mushaf-reader";
import { SurahPicker } from "./mistake-board-parts";
import { useLivePages } from "./use-live-pages";

/**
 * The mistakes board's mushaf heatmap: the surah picker and, once opened, the
 * page under it. Page turns and surah changes happen in place — the board's
 * other panels are not re-read on the server to move a page — and the picker
 * follows the page, so turning into the next surah moves the choice with it.
 * Opening and closing the heatmap still navigate: closed, no page is loaded.
 */
export function MistakeBoardHeat({
  note, picker, mushaf,
}: {
  note: string;
  picker: {
    options: { surah: number; name: string; count: number }[];
    hrefFor: Record<number, string>;
    closeHref: string;
    /** The run's surahs in run order, each with its first page… */
    order: { surah: number; start: number }[];
    /** …and which end of a page's surahs counts as "the" surah on it: the
     *  last for the full mushaf, the first for the programme's run. */
    pickLast: boolean;
    /** What the server chose for the page it rendered. */
    selected: number | null;
    fallback: number | null;
  } | null;
  mushaf: {
    page: number; min: number; max: number; basePath: string;
    pages: MushafPage[];
    heat: Record<string, string>;
    history: Record<string, WordHistoryEntry[]>;
    surahNames: SurahNames;
    tint: MistakeRow[];
  } | null;
}) {
  const { view, turning, turn } = useLivePages(
    { pages: mushaf?.pages ?? [], heat: mushaf?.heat, history: mushaf?.history },
    mushaf ? { page: mushaf.page, min: mushaf.min, max: mushaf.max, param: "heat", tint: mushaf.tint } : undefined,
  );

  // The same rule the server applies to `heat`, now for the page shown.
  const surahAt = (page: number): number | null => {
    if (!picker) return null;
    const starts = picker.order.filter((s) => s.start <= page);
    return (picker.pickLast ? starts.at(-1) : starts[0])?.surah ?? null;
  };
  const selected = !mushaf ? picker?.selected ?? null
    : view.page === mushaf.page ? picker?.selected ?? null
      : surahAt(view.page);
  const startOf = new Map(picker?.order.map((s) => [s.surah, s.start]));

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="label">Mushaf heatmap</span>
          <span className="note">{note}</span>
        </div>
        {picker && <div className="flex items-center gap-2">
          <SurahPicker
            // keyed on the open surah, so turning pages into the next surah
            // (or tapping one in the list) moves the choice with it
            key={selected ?? "closed"}
            options={picker.options}
            selected={selected ?? picker.fallback}
            hrefFor={picker.hrefFor}
            open={mushaf !== null}
            closeHref={picker.closeHref}
            onPick={turn ? (n) => { const p = startOf.get(n); if (p !== undefined) void turn(p); } : undefined}
          />
        </div>}
      </div>
      {mushaf && (
        <MushafPager page={view.page} min={mushaf.min} max={mushaf.max} basePath={mushaf.basePath} param="heat"
          onTurn={turn} busy={turning}>
          <HeatViewer pages={view.pages} heat={view.heat} history={view.history} surahNames={mushaf.surahNames} />
        </MushafPager>
      )}
    </>
  );
}
