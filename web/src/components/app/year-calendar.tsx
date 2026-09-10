import { Fragment } from "react";
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
import { sessionLabel } from "@/lib/attendance/session";
import { monthsBetween } from "@/lib/attendance/month";
import { CalendarMonths, SESSION_DOT, type CalendarDay } from "./calendar-months";
import type { PlannedWeek } from "@/lib/curriculum/plan";
import { Rule } from "./rule";
import { cn } from "@/lib/utils";

/**
 * The teaching year, drawn for one class.
 *
 * The grid carries the shape of the year — which days are classes, which
 * subject each is, where the terms stop. The detail lives behind the day:
 * tap one and it opens onto the rules being taught and a link to each video.
 * That split is deliberate. The plan used to sit under each term as a list of
 * every Monday and its rules, which was accurate and unreadable.
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

function Legend({ timetable }: { timetable: Timetable }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {(["tajweed", "hifdh"] as const).map((type) => (
        <span key={type} className="flex items-center gap-2 text-xs">
          <span className={cn("size-2 rounded-full", SESSION_DOT[type])} aria-hidden />
          <span className="font-medium">{sessionLabel(type)}</span>
          <span className="text-muted-foreground">{weekdayNameFor(timetable, type)}s</span>
        </span>
      ))}
    </div>
  );
}

function TermBlock({
  term,
  timetable,
  section,
  today,
  days,
}: {
  term: Term;
  timetable: Timetable;
  section: Section;
  today: string;
  days: Record<string, CalendarDay>;
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

        <CalendarMonths
          months={monthsBetween(term.startsOn, term.endsOn)}
          days={days}
          today={today}
        />

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

  // Everything the grid needs, keyed by date and flattened into plain data —
  // the grid is a client component, so what crosses to it has to serialize.
  // Built once for the year rather than per term: it is about seventy entries
  // and rebuilding it three times would only be harder to follow.
  const days: Record<string, CalendarDay> = {};
  const dayFor = (iso: string): CalendarDay =>
    (days[iso] ??= { type: null, holiday: null, events: [], lessons: [] });

  for (const term of TERMS) {
    for (const date of termSessions(term.id, timetable)) {
      const day = dayFor(date);
      day.type = sessionTypeFor(date, timetable);
      day.holiday = holidayReason(date);
    }
  }
  for (const weeks of Object.values(plans))
    for (const week of weeks) dayFor(week.date).lessons = week.lessons;
  for (const event of EVENTS)
    if (!event.section || event.section === section)
      dayFor(event.date).events.push({ title: event.title, detail: event.detail });

  // The upcoming class names its rules too, so the commonest question — what
  // is on on Monday — is answered without opening anything.
  const upcomingTopics = days[upcoming]?.lessons.map((l) => l.label).join(" · ");

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
              {upcomingTopics && (
                <span className="text-sm text-muted-foreground">{upcomingTopics}</span>
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
            days={days}
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
