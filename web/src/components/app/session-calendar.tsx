"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Popover } from "@base-ui/react/popover";
import { CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import {
  breakContaining,
  holidayReason,
  isSessionDate,
  nearestSessionDate,
  sessionDates,
  sessionTypeFor,
  teachingDaysLabel,
  type Timetable,
} from "@/lib/attendance/calendar";
import { sessionLabel } from "@/lib/attendance/session";
import {
  WEEKDAY_INITIALS,
  monthGrid,
  monthLabel,
  monthOf,
  shiftMonth,
  type Month,
} from "@/lib/attendance/month";
import { cn } from "@/lib/utils";

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
 *
 * Which days those are depends on the CLASS — the brothers do tajweed on
 * Monday and hifdh on Thursday, the sisters the other way about, and the
 * sisters settle their hifdh day per class — so the picker is drawn for one
 * timetable and cannot be drawn without one.
 */
export function SessionCalendar({
  value,
  today,
  basePath,
  timetable,
}: {
  value: string;
  /** Passed in rather than read from the clock here: this renders on the
   *  server first, and a UTC server disagreeing with a BST browser about
   *  what "today" is would be a hydration mismatch. */
  today: string;
  basePath: string;
  timetable: Timetable;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<Month>(() => monthOf(value));
  const [pending, startTransition] = useTransition();

  const dates = sessionDates(timetable);
  const firstMonth = monthOf(dates[0]);
  const lastMonth = monthOf(dates[dates.length - 1]);
  const cells = useMemo(() => monthGrid(month), [month]);

  const latest = nearestSessionDate(today, timetable);

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
              {WEEKDAY_INITIALS.map((d, i) => (
                <span key={i} className="pb-1 text-[10px] uppercase text-muted-foreground">
                  {d}
                </span>
              ))}

              {cells.map((iso, i) => {
                if (!iso) return <span key={i} />;

                const day = new Date(`${iso}T12:00:00`).getDate();
                const holiday = holidayReason(iso);
                const term = breakContaining(iso);

                if (!isSessionDate(iso, timetable)) {
                  // Three different silences, and only the first two have a
                  // reason worth giving: a day off inside term, a whole break
                  // between terms, and an ordinary Tuesday.
                  return (
                    <span
                      key={iso}
                      title={holiday ?? term?.label ?? undefined}
                      className={cn(
                        "flex size-8 items-center justify-center rounded-md text-xs tabular-nums",
                        holiday
                          ? "text-muted-foreground line-through"
                          : "text-muted-foreground/40",
                      )}
                    >
                      {day}
                    </span>
                  );
                }

                const selected = iso === value;
                const type = sessionTypeFor(iso, timetable);
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => go(iso)}
                    title={type ? `${sessionLabel(type)} session` : undefined}
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
                {teachingDaysLabel(timetable)} only
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
