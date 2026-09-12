"use client";

import { useMemo, useState } from "react";
import { Group } from "@visx/group";
import { HeatmapRect } from "@visx/heatmap";
import { ParentSize } from "@visx/responsive";
import { scaleLinear } from "@visx/scale";
import { motion } from "motion/react";
import {
  buildActivityGrid, dayKey, longestStreak, summarise,
  type RevisionDay,
} from "@/lib/hifz/revision-activity";
import { cn } from "@/lib/utils";

/**
 * Five levels off the app's own --ok, the same green the hifdh grid marks a
 * passed surah with, so the heatmap reads as part of this app rather than a
 * chart dropped into it. Level 0 is a tint of the foreground, not a grey, so
 * it holds up in both themes.
 */
const LEVEL_COLORS = [
  "color-mix(in oklab, var(--foreground) 7%, var(--card))",
  "color-mix(in oklab, var(--ok) 22%, var(--card))",
  "color-mix(in oklab, var(--ok) 45%, var(--card))",
  "color-mix(in oklab, var(--ok) 70%, var(--card))",
  "var(--ok)",
];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const MARGIN = { top: 18, right: 4, bottom: 4, left: 28 };

type Hover = { x: number; y: number; date: Date; day: RevisionDay | null } | null;

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** What the tooltip says for a cell. Reads as a sentence, not a stat dump. */
function describe(date: Date, day: RevisionDay | null): string {
  const when = date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  if (!day || (day.pages === 0 && day.sessions === 0)) return `No revision · ${when}`;
  const parts: string[] = [];
  if (day.pages > 0) parts.push(plural(day.pages, "page"));
  if (day.surahs > 0) parts.push(plural(day.surahs, "surah"));
  if (day.sessions > 0) parts.push(plural(day.sessions, "session"));
  return `${parts.join(" · ")} — ${when}`;
}

/**
 * A contribution grid of revision activity: one column per week, one row per
 * weekday, shaded by the mushaf pages covered that day.
 *
 * `weeks` columns ending on `end`; the last column is partial when the week
 * is not over, so the grid always ends on today rather than padding forward
 * into days that have not happened.
 */
export function RevisionHeatmap({
  days,
  end,
  weeks = 27,
  weekStartDay = 1,
  className,
}: {
  days: RevisionDay[];
  end: string;          // ISO day — passed from the server so SSR and client agree
  weeks?: number;
  weekStartDay?: number;
  className?: string;
}) {
  const [hover, setHover] = useState<Hover>(null);

  const endDate = useMemo(() => {
    const [y, m, d] = end.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [end]);

  const columns = useMemo(
    () => buildActivityGrid(days, { end: endDate, weeks, weekStartDay }),
    [days, endDate, weeks, weekStartDay],
  );

  // Only days inside the rendered window count towards the summary — the
  // figures under the grid must describe what is actually on screen.
  const shown = useMemo(() => {
    const keys = new Set(columns.flatMap((c) => c.bins.map((b) => dayKey(b.date))));
    return days.filter((d) => keys.has(d.date));
  }, [columns, days]);

  const totals = useMemo(() => summarise(shown), [shown]);
  const streak = useMemo(() => longestStreak(shown), [shown]);

  // Row labels follow weekStartDay, so a Monday-first grid reads Mon..Sun.
  const rowLabel = (row: number) => WEEKDAYS[(row + weekStartDay) % 7];

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-sm font-medium">Revision activity</h3>
        <p className="text-xs text-muted-foreground tabular-nums">
          {plural(totals.pages, "page")} over {plural(totals.activeDays, "day")}
          {streak > 1 && <> · best run {plural(streak, "day")}</>}
        </p>
      </div>

      <div className="relative">
        <ParentSize debounceTime={0}>
          {({ width }) => {
            if (width < 40) return null;
            const cols = columns.length || 1;
            const gap = 2;
            const plotW = Math.max(0, width - MARGIN.left - MARGIN.right);
            // Square cells sized to the available width; the grid's height
            // follows from that rather than being fixed, so it never distorts.
            const cell = Math.max(6, Math.floor((plotW + gap) / cols) - gap);
            const step = cell + gap;
            const height = MARGIN.top + step * 7 - gap + MARGIN.bottom;

            const xScale = scaleLinear<number>({ domain: [0, cols], range: [0, cols * step] });
            const yScale = scaleLinear<number>({ domain: [0, 7], range: [0, 7 * step] });

            // A month label sits above the first column that starts that month.
            const monthTicks: { x: number; label: string }[] = [];
            let lastMonth = -1;
            columns.forEach((c, i) => {
              const m = c.bins[0].date.getMonth();
              if (m !== lastMonth) {
                lastMonth = m;
                monthTicks.push({ x: i * step, label: MONTHS[m] });
              }
            });

            return (
              <svg width={width} height={height} role="img" aria-label="Revision activity heatmap">
                <Group left={MARGIN.left} top={MARGIN.top}>
                  {monthTicks.map((t) => (
                    <text key={`${t.label}-${t.x}`} x={t.x} y={-6}
                      className="fill-muted-foreground" fontSize={10}>
                      {t.label}
                    </text>
                  ))}
                  {[1, 3, 5].map((row) => (
                    <text key={row} x={-6} y={row * step + cell / 2} textAnchor="end"
                      dominantBaseline="middle" className="fill-muted-foreground" fontSize={10}>
                      {rowLabel(row)}
                    </text>
                  ))}
                  <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ duration: 0.45, ease: "easeOut" }}>
                    <HeatmapRect
                      data={columns}
                      xScale={(d) => xScale(d) ?? 0}
                      yScale={(d) => yScale(d) ?? 0}
                      // visx types the bin value loosely; clamp to our five levels
                      colorScale={(v) =>
                        LEVEL_COLORS[Math.min(4, Math.max(0, Math.round(Number(v))))]
                      }
                      binWidth={cell}
                      binHeight={cell}
                      gap={gap}
                    >
                      {(heatmap) =>
                        heatmap.map((cols_) =>
                          cols_.map((bin) => {
                            const datum = bin.bin as unknown as {
                              date: Date; day: RevisionDay | null; count: number;
                            };
                            return (
                              <rect
                                key={`${bin.row}-${bin.column}`}
                                x={bin.x}
                                y={bin.y}
                                width={bin.width}
                                height={bin.height}
                                rx={2}
                                fill={LEVEL_COLORS[Math.min(4, datum.count)]}
                                stroke="color-mix(in oklab, var(--foreground) 6%, transparent)"
                                strokeWidth={0.5}
                                className="cursor-default"
                                onMouseEnter={() =>
                                  setHover({
                                    x: bin.x + MARGIN.left + bin.width / 2,
                                    y: bin.y + MARGIN.top,
                                    date: datum.date,
                                    day: datum.day,
                                  })
                                }
                                onMouseLeave={() => setHover(null)}
                              />
                            );
                          }),
                        )
                      }
                    </HeatmapRect>
                  </motion.g>
                </Group>
              </svg>
            );
          }}
        </ParentSize>

        {hover && (
          <div
            className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-md border border-line bg-card px-2 py-1 text-xs whitespace-nowrap shadow-sm"
            style={{ left: hover.x, top: hover.y - 6 }}
            role="status"
          >
            {describe(hover.date, hover.day)}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
        <span>Less</span>
        {LEVEL_COLORS.map((c, i) => (
          <span key={i} aria-hidden className="inline-block size-2.5 rounded-[2px]"
            style={{ background: c, outline: "0.5px solid color-mix(in oklab, var(--foreground) 6%, transparent)" }} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
