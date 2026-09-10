import { Fragment } from "react";
import Link from "next/link";
import {
  EVENTS,
  TERMS,
  breaks,
  holidayReason,
  nextSessionDate,
  sessionTypeFor,
  termSessions,
  weekdayNameFor,
  type Section,
  type Term,
  type Timetable,
} from "@/lib/attendance/calendar";
import { sessionLabel, type SessionType } from "@/lib/attendance/session";
import {
  WEEKDAY_INITIALS,
  monthGrid,
  monthLabel,
  monthsBetween,
} from "@/lib/attendance/month";
import type { PlannedWeek } from "@/lib/curriculum/plan";
import { Rule } from "./rule";
import { cn } from "@/lib/utils";

/**
 * The teaching year, drawn for one class.
 *
 * It answers one question and deliberately not more: on which days do I have
 * a class, and which class is it. There is no lesson title, no homework and
 * no progress on here — the curriculum for each day is still being decided,
 * and a calendar that promised a topic per date would be wrong within a week.
 *
 * It takes two things, and they are not the same thing:
 *
 *  · `timetable` — which weekday each subject falls on. A property of the
 *    CLASS. The brothers do tajweed on Monday and hifdh on Thursday; the
 *    sisters do tajweed on Wednesday and hifdh on Monday; and the sisters'
 *    hifdh day is settled per class once the year starts, so two classes in
 *    the same section can differ.
 *  · `section` — which cohort the reader is in. Only used to decide whose
 *    events are theirs, since an exam or a speaker can be for one section.
 *  · `plans` — what this class studies on each of its tajweed Mondays, or
 *    nothing at all for a class with no syllabus yet. See lib/curriculum/plan.
 *
 * Both the student and teacher screens render this; the only difference
 * between them is whose class gets passed in.
 */

const long = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

const short = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });

const eventsFor = (section: Section, from: string, to = from) =>
  EVENTS.filter(
    (e) => e.date >= from && e.date <= to && (!e.section || e.section === section),
  );

/** Tajweed carries the page's ink, hifdh the ochre accent — the same two
 *  weights the rest of the app uses for "the main thing" and "the other
 *  thing", so the legend is the only place they need explaining. */
const DOT: Record<SessionType, string> = {
  tajweed: "bg-ink",
  hifdh: "bg-ok",
};

function Legend({ timetable }: { timetable: Timetable }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {(["tajweed", "hifdh"] as const).map((type) => (
        <span key={type} className="flex items-center gap-2 text-xs">
          <span className={cn("size-2 rounded-full", DOT[type])} aria-hidden />
          <span className="font-medium">{sessionLabel(type)}</span>
          <span className="text-muted-foreground">{weekdayNameFor(timetable, type)}s</span>
        </span>
      ))}
    </div>
  );
}

function MonthGrid({
  month,
  timetable,
  section,
  today,
  topicByDate,
}: {
  month: string;
  timetable: Timetable;
  section: Section;
  today: string;
  topicByDate: Map<string, string>;
}) {
  return (
    <div className="min-w-[13.5rem] flex-1">
      <div className="mb-2 text-xs font-medium">{monthLabel(month)}</div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAY_INITIALS.map((d, i) => (
          <span key={i} className="pb-1 text-[10px] uppercase text-muted-foreground">
            {d}
          </span>
        ))}

        {monthGrid(month).map((iso, i) => {
          if (!iso) return <span key={i} />;
          const day = new Date(`${iso}T12:00:00`).getDate();
          const type = sessionTypeFor(iso, timetable);
          const holiday = holidayReason(iso);
          const events = eventsFor(section, iso);

          return (
            <span
              key={iso}
              data-tip={type ? `${sessionLabel(type)} class` : (holiday ?? undefined)}
              data-tip-meta={type ? long(iso) : undefined}
              data-tip-value={topicByDate.get(iso)}
              title={holiday ?? undefined}
              className={cn(
                "flex h-9 flex-col items-center justify-center gap-1 rounded-md text-xs tabular-nums",
                type ? "font-medium" : "text-muted-foreground/40",
                holiday && "text-muted-foreground line-through",
                iso === today && "ring-1 ring-line",
              )}
            >
              <span>
                {day}
                {type && <span className="sr-only"> — {sessionLabel(type)} class</span>}
                {events.length > 0 && <span className="sr-only"> — {events[0].title}</span>}
              </span>
              <span className="flex h-1.5 items-center gap-0.5">
                {type && <span className={cn("size-1.5 rounded-full", DOT[type])} aria-hidden />}
                {events.length > 0 && (
                  <span className="size-1.5 rounded-full bg-warn" aria-hidden />
                )}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** One course on one Monday: a link when following it works and there is
 *  something to watch, and plain text every other time. */
function Planned({ lesson }: { lesson: PlannedWeek["lessons"][number] }) {
  const name = `${lesson.courseLabel} ${lesson.index}`;
  if (lesson.href) {
    return (
      <Link href={lesson.href} className="underline underline-offset-2 hover:text-ok">
        {name}
      </Link>
    );
  }
  return (
    <span
      className={lesson.missing ? "text-muted-foreground/60" : undefined}
      // The title is only ever known once the week is open; before that the
      // topic name is all a student is told.
      title={lesson.title ?? undefined}
    >
      {name}
    </span>
  );
}

function TermPlan({ plan }: { plan: PlannedWeek[] }) {
  return (
    <div className="space-y-1.5 border-t border-line pt-3">
      <span className="label">Mondays this term</span>
      <ul className="space-y-1">
        {plan.map((week) => (
          <li key={week.date} className="flex flex-wrap items-baseline gap-x-3 text-sm">
            <span className="w-[8.5rem] shrink-0 text-muted-foreground tabular-nums">
              Week {week.number} · {short(week.date)}
            </span>
            <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              {week.lessons.map((l, i) => (
                <Fragment key={`${l.courseLabel}-${l.index}`}>
                  {i > 0 && <span aria-hidden className="text-muted-foreground/40">·</span>}
                  <Planned lesson={l} />
                </Fragment>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TermBlock({
  term,
  timetable,
  section,
  today,
  plan,
  topicByDate,
}: {
  term: Term;
  timetable: Timetable;
  section: Section;
  today: string;
  plan?: PlannedWeek[];
  topicByDate: Map<string, string>;
}) {
  // Counted, never derived from the span: Term 2 opens on a Tuesday, so it is
  // not a whole number of weeks for either subject, and the two sections do
  // not get the same split of it.
  const counts = (["tajweed", "hifdh"] as const).map((type) => ({
    type,
    n: termSessions(term.id, timetable, type).length,
  }));
  const events = eventsFor(section, term.startsOn, term.endsOn);

  return (
    <div className="field">
      <section className="box c12">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <span className="label">
            {short(term.startsOn)} – {short(term.endsOn)}
          </span>
          <span className="label hi">
            {counts.map((c) => `${c.n} ${sessionLabel(c.type)}`).join(" · ")}
          </span>
        </div>

        <div className="flex flex-wrap gap-x-8 gap-y-6">
          {monthsBetween(term.startsOn, term.endsOn).map((month) => (
            <MonthGrid
              key={month}
              month={month}
              timetable={timetable}
              section={section}
              today={today}
              topicByDate={topicByDate}
            />
          ))}
        </div>

        {plan && plan.length > 0 && <TermPlan plan={plan} />}

        {events.length > 0 && (
          <ul className="space-y-1 border-t border-line pt-3">
            {events.map((e) => (
              <li key={`${e.date}-${e.title}`} className="text-sm">
                <span className="font-medium">{e.title}</span>
                <span className="text-muted-foreground"> · {long(e.date)}</span>
                {e.detail && <div className="note">{e.detail}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function YearCalendar({
  timetable,
  section,
  today,
  plans = {},
}: {
  timetable: Timetable;
  section: Section;
  today: string;
  /** Keyed by term id. Absent for a class with no syllabus. */
  plans?: Record<number, PlannedWeek[]>;
}) {
  const upcoming = nextSessionDate(today, timetable);
  const upcomingType = sessionTypeFor(upcoming, timetable);
  const gaps = breaks();
  const yearOver = today > TERMS[TERMS.length - 1].endsOn;

  // Date → "Ghunna 1 · Mudūd 1", so a day in the grid can say what it holds
  // without the reader hunting for it in the list below.
  const topicByDate = new Map<string, string>();
  for (const weeks of Object.values(plans))
    for (const week of weeks)
      topicByDate.set(
        week.date,
        week.lessons.map((l) => `${l.courseLabel} ${l.index}`).join(" · "),
      );

  return (
    <>
      <div className="field">
        <section className="box c12">
          <span className="label">{yearOver ? "The year has finished" : "Next class"}</span>
          {!yearOver && (
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-lg font-medium">
                {upcoming === today ? "Today" : long(upcoming)}
              </span>
              {upcomingType && (
                <span className="label hi">{sessionLabel(upcomingType)}</span>
              )}
              {topicByDate.has(upcoming) && (
                <span className="text-sm text-muted-foreground">
                  {topicByDate.get(upcoming)}
                </span>
              )}
            </div>
          )}
          <Legend timetable={timetable} />
          {/* The legend above already names the days, so this says only the
              thing it cannot: the year has holes in it. */}
          <div className="note">Nothing is taught between the terms.</div>
        </section>
      </div>

      {TERMS.map((term, i) => (
        <Fragment key={term.id}>
          <Rule label={`Term ${term.id}`} />
          <TermBlock
            term={term}
            timetable={timetable}
            section={section}
            today={today}
            plan={plans[term.id]}
            topicByDate={topicByDate}
          />
          {gaps[i] && (
            <div className="field">
              <section className="box c12">
                <span className="label">{gaps[i].label}</span>
                <div className="text-sm">
                  {short(gaps[i].startsOn)} – {short(gaps[i].endsOn)} · no classes
                </div>
                {gaps[i].detail && <div className="note">{gaps[i].detail}</div>}
              </section>
            </div>
          )}
        </Fragment>
      ))}
    </>
  );
}
