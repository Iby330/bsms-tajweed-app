"use client";

import type { MouseEvent } from "react";
import type { MushafPage } from "@/lib/quran/mushaf";
import type { MistakeRow } from "@/lib/hifz/mistakes";
import type { WordHistoryEntry } from "@/lib/hifz/heat-spread";
import { cn } from "@/lib/utils";
import { HeatViewer } from "./heat-viewer";
import { MushafPager } from "./mushaf-pager";
import type { SurahNames } from "./mushaf-reader";
import { useLivePages } from "./use-live-pages";

export type HeatChip = { surah: number; label: string; page: number };

/**
 * A read-only heatmap mushaf that turns in place: the partner-revision
 * heatmap (a chip per surah with marks above the page) and a surah's own
 * page (no chips, `param="p"`). The page is tinted by `tint`. A chip jumps to
 * its surah's first page, the arrows a page at a time, with no server render
 * of the page around it. The chips are real links, so a new-tab click still
 * opens the page the old way; a plain click is caught here.
 */
export function LiveHeatMushaf({
  page, min, max, basePath, param = "heat", pages, heat, history, surahNames, tint, chips = [],
}: {
  page: number;
  min: number;
  max: number;
  basePath: string;
  /** The query key that carries the page. */
  param?: string;
  pages: MushafPage[];
  heat: Record<string, string>;
  history: Record<string, WordHistoryEntry[]>;
  surahNames?: SurahNames;
  /** The marks behind the tint, so a turned-to page is tinted as here. */
  tint: MistakeRow[];
  chips?: HeatChip[];
}) {
  const { view, turning, turn } = useLivePages(
    { pages, heat, history },
    { page, min, max, param, tint },
  );
  // A chip is lit while its surah is on the page shown.
  const onPage = new Set(view.pages.flatMap((p) => p.lines.flatMap((l) => l.words.map((w) => w.surah))));
  const jump = (to: number) => (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    turn?.(to);
  };

  return (
    <>
      {chips.length > 0 && <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <a key={c.surah} href={`${basePath}&${param}=${c.page}`} onClick={jump(c.page)}
            className={cn(
              "rounded-md border border-line px-2 py-1 text-xs transition-colors",
              onPage.has(c.surah) ? "bg-primary text-primary-foreground" : "hover:bg-muted",
            )}>
            {c.label}
          </a>
        ))}
      </div>}
      <MushafPager page={view.page} min={min} max={max} basePath={basePath} param={param} onTurn={turn} busy={turning}>
        <HeatViewer pages={view.pages} heat={view.heat} history={view.history} surahNames={surahNames} />
      </MushafPager>
    </>
  );
}
