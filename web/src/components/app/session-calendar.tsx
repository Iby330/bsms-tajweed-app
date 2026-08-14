"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Popover } from "@base-ui/react/popover";
import { CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import {
  holidayReason,
  isSessionDate,
  nearestSessionDate,
  sessionDates,
} from "@/lib/attendance/calendar";
import { isoDate } from "@/lib/attendance/session";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/** "2026-10" — a month is identified by the prefix of any date inside it. */
type Month = string;

function monthOf(iso: string): Month {
  return iso.slice(0, 7);
}

function shiftMonth(month: Month, by: number): Month {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + by, 1, 12);
  return monthOf(isoDate(d));
}

/**
 * The days of a month laid out Monday-first, padded with nulls so the grid
 * starts on the right weekday and ends on a whole row.
 */
function monthGrid(month: Month): (string | null)[] {
  const [y, m] = month.split("-").map(Number);
  const lead = (new Date(y, m - 1, 1, 12).getDay() + 6) % 7; // Sunday is 0
  const days = new Date(y, m, 0).getDate();
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(isoDate(new Date(y, m - 1, d, 12)));
  while (cells.length % 7) cells.push(null);
  return cells;
}

const monthLabel = (month: Month) =>
  new Date(`${month}-01T12:00:00`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

const dateLabel = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/**
 * Date picker for the register.
 *
 * A whole month is on show — a teacher needs to see where a lesson sits in the
 * week — but only the days a class is actually taught can be picked. Everything
 * else renders greyed and inert, so an off day reads as "not a lesson" rather
 * than as a control that failed to respond. Days lost to a holiday are struck
 * through and say why, which is a different fact from "we don't teach Tuesdays".
 *
 * Native `<input type="date">` can't express any of this: its only constraints
 * are min and max, so it would happily hand back a Tuesday in February.
 */
export function SessionCalendar({
  value,
  today,
  basePath,
}: {
  value: string;
  /** Passed in rather than read from the clock here: this renders on the
   *  server first, and a UTC server disagreeing with a BST browser about
   *  what "today" is would be a hydration mismatch. */
  today: string;
  basePath: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<Month>(() => monthOf(value));
  const [pending, startTransition] = useTransition();

  const dates = sessionDates();
  const firstMonth = monthOf(dates[0]);
  const lastMonth = monthOf(dates[dates.length - 1]);
  const cells = useMemo(() => monthGrid(month), [month]);

  const latest = nearestSessionDate(today);

  const go = (iso: string) => {
    setOpen(false);
    startTransition(() => router.push(`${basePath}?date=${iso}`));
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        // Reopening after a jump should land on the month being looked at, not
        // wherever the last browse left off.
        if (next) setMonth(monthOf(value));
        setOpen(next);
      }}
    >
      <Popover.Trigger
        className={cn(
          "flex h-8 items-center gap-2 rounded-md border border-line bg-card px-2.5 text-xs transition-colors hover:bg-muted",
          pending && "opacity-60",
        )}
      >
        <CalendarDaysIcon className="size-3.5 text-muted-foreground" />
        {dateLabel(value)}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} className="z-50">
          <Popover.Popup className="rounded-xl bg-popover p-3 text-popover-foreground ring-1 ring-foreground/10 outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            <div className="mb-2 flex items-center justify-between gap-3">
              <button
                type="button"
                aria-label="Previous month"
                disabled={month <= firstMonth}
                onClick={() => setMonth(shiftMonth(month, -1))}
                className="rounded-md p-1 transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-30"
              >
                <ChevronLeftIcon className="size-4" />
              </button>
              <span className="text-xs font-medium">{monthLabel(month)}</span>
              <button
                type="button"
                aria-label="Next month"
                disabled={month >= lastMonth}
                onClick={() => setMonth(shiftMonth(month, 1))}
                className="rounded-md p-1 transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-30"
              >
                <ChevronRightIcon className="size-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-0.5 text-center">
              {WEEKDAYS.map((d, i) => (
                <span key={i} className="pb-1 text-[10px] uppercase text-muted-foreground">
                  {d}
                </span>
              ))}

              {cells.map((iso, i) => {
                if (!iso) return <span key={i} />;

                const day = new Date(`${iso}T12:00:00`).getDate();
                const holiday = holidayReason(iso);

                if (!isSessionDate(iso)) {
                  return (
                    <span
                      key={iso}
                      title={holiday ?? undefined}
                      className={cn(
                        "flex size-8 items-center justify-center rounded-md text-xs tabular-nums",
                        holiday ? "text-muted-foreground line-through" : "text-muted-foreground/40",
                      )}
                    >
                      {day}
                    </span>
                  );
                }

                const selected = iso === value;
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => go(iso)}
                    aria-current={selected ? "date" : undefined}
                    className={cn(
                      "flex size-8 items-center justify-center rounded-md text-xs font-medium tabular-nums transition-colors",
                      selected
                        ? "bg-ink text-primary-foreground"
                        : "hover:bg-muted",
                      !selected && iso === today && "ring-1 ring-line",
                    )}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            <div className="mt-2 flex items-center justify-between gap-3 border-t border-line pt-2">
              <span className="text-[10px] text-muted-foreground">
                Mondays &amp; Thursdays only
              </span>
              <button
                type="button"
                onClick={() => go(latest)}
                disabled={latest === value}
                className="rounded-md px-1.5 py-0.5 text-[11px] transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40"
              >
                Latest session
              </button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
