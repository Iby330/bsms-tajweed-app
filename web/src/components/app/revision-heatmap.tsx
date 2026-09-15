"use client";

import { useMemo } from "react";
import {
  HeatmapCells,
  HeatmapChart,
  HeatmapInteractionBoundary,
  HeatmapInteractionProvider,
  HeatmapLegend,
  HeatmapTooltip,
  HeatmapXAxis,
  HeatmapYAxis,
} from "@/components/charts/heatmap";
import {
  buildActivityGrid, dayKey, longestStreak, summarise, type RevisionDay,
} from "@/lib/hifz/revision-activity";
import { cn } from "@/lib/utils";

/**
 * Revision activity as a contribution grid — Bklit UI's heatmap
 * (components/charts/heatmap, installed from the @bklit shadcn registry)
 * over the app's own data layer. Colours come from --chart-scale-01…05 in
 * globals.css, cut from --ok so the grid wears the same green a passed
 * surah does.
 *
 * `weeks` columns ending on `end`; buildActivityGrid stops at `end`, so the
 * last column is partial and the grid never pads forward into days that
 * have not happened. `end` arrives as a plain ISO day from the server, so
 * server and browser agree on what "today" is and hydration stays quiet.
 */

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** The tooltip line for a cell. Bklit hands us (level, date); the day's
 *  real figures are looked up from the date so it reads as a sentence. */
function describe(date: Date, day: RevisionDay | undefined): string {
  const when = date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  if (!day || (day.pages === 0 && day.sessions === 0)) return `No revision · ${when}`;
  const parts: string[] = [];
  if (day.pages > 0) parts.push(plural(day.pages, "page"));
  if (day.surahs > 0) parts.push(plural(day.surahs, "surah"));
  if (day.sessions > 0) parts.push(plural(day.sessions, "session"));
  return `${parts.join(" · ")} · ${when}`;
}

export function RevisionHeatmap({
  days,
  end,
  weeks = 27,
  weekStartDay = 1,
  className,
}: {
  days: RevisionDay[];
  end: string;          // ISO day, resolved on the server
  weeks?: number;
  weekStartDay?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  className?: string;
}) {
  const endDate = useMemo(() => {
    const [y, m, d] = end.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [end]);

  const columns = useMemo(
    () => buildActivityGrid(days, { end: endDate, weeks, weekStartDay }),
    [days, endDate, weeks, weekStartDay],
  );

  // Only days inside the rendered window count towards the summary line —
  // the figures beside the grid must describe what is actually on screen.
  const shown = useMemo(() => {
    const keys = new Set(columns.flatMap((c) => c.bins.map((b) => dayKey(b.date))));
    return days.filter((d) => keys.has(d.date));
  }, [columns, days]);
  const byDate = useMemo(() => new Map(shown.map((d) => [d.date, d])), [shown]);
  const totals = useMemo(() => summarise(shown), [shown]);
  const streak = useMemo(() => longestStreak(shown), [shown]);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-sm font-medium">Revision activity</h3>
        <p className="text-xs text-muted-foreground tabular-nums">
          {plural(totals.pages, "page")} over {plural(totals.activeDays, "day")}
          {streak > 1 && <> · best run {plural(streak, "day")}</>}
        </p>
      </div>

      <HeatmapInteractionProvider>
        <HeatmapInteractionBoundary>
          <div className="flex w-full flex-col items-stretch gap-2">
            <HeatmapChart
              className="w-full"
              data={columns}
              layout="fluid"
              weekStartDay={weekStartDay}
              gap={2}
              margin={{ top: 20, right: 2, bottom: 0, left: 30 }}
            >
              <HeatmapCells cornerRadius={2} />
              <HeatmapXAxis />
              <HeatmapYAxis tickFilter="odd" labelFormat="full" />
              <HeatmapTooltip
                instant
                formatLabel={(_level, date) => describe(date, byDate.get(dayKey(date)))}
              />
            </HeatmapChart>
            <HeatmapLegend cellSize={10} align="end" fontSize={11} />
          </div>
        </HeatmapInteractionBoundary>
      </HeatmapInteractionProvider>
    </div>
  );
}
