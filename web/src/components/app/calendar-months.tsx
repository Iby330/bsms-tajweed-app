"use client";

import { useState } from "react";
import Link from "next/link";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WEEKDAY_INITIALS, monthGrid, monthLabel } from "@/lib/attendance/month";
import { sessionLabel, type SessionType } from "@/lib/attendance/session";
import { cn } from "@/lib/utils";

/**
 * The month grids, with each teaching day opening onto what it holds.
 *
 * The plan used to sit under the calendar as a list — every Monday of the
 * term, each with its rules. Correct, and unreadable: thirty lines of it
 * under a grid that was already saying which days were which. The grid
 * carries the shape of the term; the day carries the detail, and you go and
 * ask for it.
 *
 * A dialog rather than a popover anchored to the cell, because the cells are
 * 36px and most of the students are on phones — a popover hung off a target
 * that small is squeezed against an edge more often than not.
 *
 * Every CLASS day opens, not only the ones with lessons behind them. A hifdh
 * day has no video series and its dialog is thin — the date and which class
 * it is — but a day that looks identical to its neighbour and then ignores
 * the tap reads as broken, and consistency is worth more than saving someone
 * an uninformative dialog. Days that are not classes stay inert.
 */

export type PlannedEntry = {
  courseLabel: string;
  /** The rule being taught, or the course and its number as a fallback. */
  label: string;
  /** Present only when the lesson page will render and has a video. */
  href: string | null;
  missing: boolean;
};

export type CalendarDay = {
  type: SessionType | null;
  /** Why a would-be teaching day is not taught, if it is not. */
  holiday: string | null;
  events: { title: string; detail?: string }[];
  lessons: PlannedEntry[];
};

const long = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

/**
 * Tajweed carries the page's ink, hifdh the ochre accent — the same two
 * weights the rest of the app uses for "the main thing" and "the other
 * thing", so the legend is the only place they need explaining.
 *
 * Exported because the legend on the year calendar has to agree with the dots
 * in the grid, and two copies of that decision would drift.
 */
export const SESSION_DOT: Record<SessionType, string> = {
  tajweed: "bg-ink",
  hifdh: "bg-ok",
};

function summarise(day: CalendarDay): string | undefined {
  // `label` already falls back to "<course> <n>" when there is no rule to
  // name, so a missing lesson needs no special case here.
  const parts = [...day.lessons.map((l) => l.label), ...day.events.map((e) => e.title)];
  return parts.length ? parts.join(" · ") : undefined;
}

export function CalendarMonths({
  months,
  days,
  today,
}: {
  months: string[];
  days: Record<string, CalendarDay>;
  today: string;
}) {
  const [openDate, setOpenDate] = useState<string | null>(null);
  const open = openDate ? days[openDate] : undefined;

  return (
    <>
      <div className="flex flex-wrap gap-x-8 gap-y-6">
        {months.map((month) => (
          <div key={month} className="min-w-[13.5rem] flex-1">
            <div className="mb-2 text-xs font-medium">{monthLabel(month)}</div>
            <div className="grid grid-cols-7 gap-0.5 text-center">
              {WEEKDAY_INITIALS.map((d, i) => (
                <span key={i} className="pb-1 text-[10px] uppercase text-muted-foreground">
                  {d}
                </span>
              ))}

              {monthGrid(month).map((iso, i) => {
                if (!iso) return <span key={i} />;
                const day = days[iso];
                const n = new Date(`${iso}T12:00:00`).getDate();
                const opens = !!day && (!!day.type || day.events.length > 0);

                const isToday = iso === today;
                const face = (
                  <>
                    {/* Today is a filled disc, not a hairline ring. The point
                        of it is to be found at a glance from across the term,
                        so that the next class can be read as a distance from
                        here — a 1px ring at this size disappears. */}
                    <span
                      data-today={isToday || undefined}
                      className={cn(
                        "flex size-[1.35rem] items-center justify-center rounded-full",
                        isToday && "bg-ink font-semibold text-primary-foreground",
                      )}
                    >
                      {n}
                      {isToday && <span className="sr-only"> — today</span>}
                      {day?.type && (
                        <span className="sr-only"> — {sessionLabel(day.type)} class</span>
                      )}
                    </span>
                    <span className="flex h-1.5 items-center gap-0.5">
                      {day?.type && (
                        <span className={cn("size-1.5 rounded-full", SESSION_DOT[day.type])} aria-hidden />
                      )}
                      {day?.events.length ? (
                        <span className="size-1.5 rounded-full bg-warn" aria-hidden />
                      ) : null}
                    </span>
                  </>
                );

                const shape =
                  "flex h-9 w-full flex-col items-center justify-center gap-1 rounded-md text-xs tabular-nums";

                if (opens) {
                  return (
                    <button
                      key={iso}
                      type="button"
                      data-day={iso}
                      aria-label={`${long(iso)}${
                        day.type ? ` — ${sessionLabel(day.type)} class` : ""
                      }${summarise(day) ? `: ${summarise(day)}` : ""}`}
                      onClick={() => setOpenDate(iso)}
                      data-tip={day.type ? `${sessionLabel(day.type)} class` : undefined}
                      data-tip-meta={long(iso)}
                      data-tip-value={summarise(day)}
                      className={cn(
                        shape,
                        "font-medium transition-colors hover:bg-muted",
                      )}
                    >
                      {face}
                    </button>
                  );
                }

                return (
                  <span
                    key={iso}
                    data-day={iso}
                    data-tip={day?.type ? `${sessionLabel(day.type)} class` : (day?.holiday ?? undefined)}
                    data-tip-meta={day?.type ? long(iso) : undefined}
                    title={day?.holiday ?? undefined}
                    className={cn(
                      shape,
                      day?.type ? "font-medium" : "text-muted-foreground/40",
                      day?.holiday && "text-muted-foreground line-through",
                    )}
                  >
                    {face}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={openDate !== null} onOpenChange={(next) => !next && setOpenDate(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{openDate ? long(openDate) : ""}</DialogTitle>
          </DialogHeader>

          {open?.type && (
            <span className="label">{sessionLabel(open.type)} class</span>
          )}

          {open && open.lessons.length > 0 && (
            <ul className="space-y-1">
              {open.lessons.map((l) =>
                l.href ? (
                  <li key={l.courseLabel}>
                    <Link
                      href={l.href}
                      onClick={() => setOpenDate(null)}
                      className="-mx-2 flex flex-col gap-0.5 rounded-md px-2 py-1.5 transition-colors hover:bg-muted"
                    >
                      <span className="text-xs text-muted-foreground">{l.courseLabel}</span>
                      <span className="font-medium">{l.label}</span>
                    </Link>
                  </li>
                ) : (
                  <li key={l.courseLabel} className="flex flex-col gap-0.5 px-2 py-1.5">
                    <span className="text-xs text-muted-foreground">{l.courseLabel}</span>
                    <span className={l.missing ? "text-muted-foreground/60" : undefined}>
                      {l.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {l.missing ? "Not on the app yet" : "Video not up yet"}
                    </span>
                  </li>
                ),
              )}
            </ul>
          )}

          {open?.events.map((e) => (
            <div key={e.title} className="rounded-md bg-muted/60 px-2 py-1.5">
              <div className="font-medium">{e.title}</div>
              {e.detail && <div className="note">{e.detail}</div>}
            </div>
          ))}
        </DialogContent>
      </Dialog>
    </>
  );
}
