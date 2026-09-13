import type { Database } from "@/lib/database.types";
import { isoDate, SESSION_TYPES, type SessionType } from "./session";

/**
 * The teaching calendar for the 2026/27 year.
 *
 * Three terms with real gaps between them, and two teaching days a week whose
 * WEEKDAY depends on the section. Everything downstream — the register's date
 * picker, the guard on the write path, both calendar screens — derives from
 * the constants below, so the year is defined in one place.
 *
 * Two things changed here that are worth stating plainly, because the old
 * version quietly assumed both were impossible:
 *
 *  1. Teaching is NOT continuous. The previous calendar ran every Monday and
 *     Thursday from October to May with no breaks at all, so the register
 *     would happily open a session on Christmas Eve or in the middle of
 *     Ramadan. Terms now bound the year, and the gaps between them are real.
 *
 *  2. Classes are NOT on the same timetable. The brothers do tajweed on
 *     Monday and hifdh on Thursday; the sisters do tajweed on Wednesday and
 *     hifdh on Monday. Both teach on a Monday, and it is a different subject
 *     each time — so a date alone can never say which session it is. Every
 *     question here takes the class's timetable as well, and the hifdh day is
 *     expected to vary class by class once the year settles.
 *
 * Dates are generated from the term bounds rather than listed. A hand-typed
 * list of sixty-odd dates is sixty-odd chances to fat-finger a day, and any
 * one of them would silently become a register nobody could open.
 */

/**
 * Taken from the database enum rather than written out here, so that adding a
 * cohort breaks the build at `SECTION_TIMETABLES` — a compiler error with
 * an obvious fix — instead of at runtime on a student's calendar. That is not
 * hypothetical: `demo` was added as a third section in migration 0020, and a
 * hand-written two-value union quietly cast around it.
 */
export type Section = Database["public"]["Enums"]["section_t"];
export type TermId = 1 | 2 | 3;

export type Term = {
  id: TermId;
  /** Inclusive. The first teaching day is this date or the next one after it
   *  that the section is taught on — a term may open mid-week. */
  startsOn: string;
  /** Inclusive, and a term may end mid-week: Term 2 stops on a Thursday, so
   *  its last tajweed Monday is three days before the term is over. */
  endsOn: string;
};

/**
 * Faculty dates, exactly as given.
 *
 * Every term now opens on a Monday and closes on a Thursday, so each one
 * holds the same number of tajweed and hifdh sessions — 8 and 8 in Term 1,
 * 5 and 5 in Term 2, 10 and 10 in Term 3.
 *
 * That balance is recent and should not be relied on. Term 2 was given as
 * starting Tuesday 5 January and was corrected to Monday the 4th, which is
 * what squared it: before the correction it held 5 hifdh sessions against
 * only 4 tajweed ones. Anything that counts sessions must COUNT them and
 * never divide the span by seven — the next set of faculty dates may well be
 * lopsided again.
 *
 * Term 1 ends on the Thursday rather than the Wednesday the faculty dates
 * first gave, which is a deliberate correction: 26 November is a lesson. It
 * squares the term at 8 of each subject for both sections, where ending a day
 * earlier would have cost the brothers their eighth hifdh and left the two
 * sections on different counts.
 */
export const TERMS: readonly Term[] = [
  { id: 1, startsOn: "2026-10-05", endsOn: "2026-11-26" },
  // Monday 4 January, not the Tuesday the first set of dates gave.
  { id: 2, startsOn: "2027-01-04", endsOn: "2027-02-04" },
  { id: 3, startsOn: "2027-03-15", endsOn: "2027-05-20" },
];

export const YEAR_START = TERMS[0].startsOn;
export const YEAR_END = TERMS[TERMS.length - 1].endsOn;

const MONDAY = 1;
const WEDNESDAY = 3;
const THURSDAY = 4;

/**
 * Which weekday a class sits each subject on.
 *
 * The two weekdays in a timetable must DIFFER: `sessionTypeFor` reads the
 * subject back off the weekday, and that inverse only exists while the
 * mapping is one-to-one. There is a test holding every timetable to it.
 */
export type Timetable = Readonly<Record<SessionType, number>>;

/**
 * The default timetable for each section.
 *
 * The brothers are Monday tajweed, Thursday hifdh. The sisters are Wednesday
 * tajweed, Monday hifdh — so both sections teach on a Monday, but not the
 * same subject, which is the reason a date can never name a session on its
 * own.
 *
 * `demo` is the training cohort from migration 0020, not a real class. It
 * mirrors the brothers so a teacher learning the register on demo students
 * sees the same shape of week they will see on their own.
 *
 * The sisters' HIFDH DAY IS PROVISIONAL. It is settled at the start of the
 * year against student availability and may end up differing class by class;
 * Monday is a placeholder until those days are known. When they arrive they
 * go in CLASS_TIMETABLES below, not here.
 */
export const SECTION_TIMETABLES: Readonly<Record<Section, Timetable>> = {
  brothers: { tajweed: MONDAY, hifdh: THURSDAY },
  sisters: { tajweed: WEDNESDAY, hifdh: MONDAY },
  demo: { tajweed: MONDAY, hifdh: THURSDAY },
};

/**
 * Per-class overrides, which beat the section default.
 *
 * Empty on purpose. The sisters pick their hifdh day class by class once the
 * year starts, and this is where those choices land — one entry per class
 * that differs, keyed by `classes.name` (unique in the schema, and the key
 * the class artwork already uses).
 *
 * Adding one is the whole change: everything downstream reads the resolved
 * timetable rather than the section, so a class moving its hifdh to Tuesday
 * is a line here and nothing else.
 *
 *   "Hareer": { tajweed: WEDNESDAY, hifdh: TUESDAY },
 */
export const CLASS_TIMETABLES: Readonly<Record<string, Timetable>> = {};

/**
 * Whether the sisters' hifdh weekday above is still the placeholder.
 *
 * A flag rather than a comment because one screen now PUBLISHES the teaching
 * days to people who are not yet students — the terms on /apply — and a
 * public page must not state a placeholder as a fact. While this is true that
 * page says the hifdh evening is confirmed before term starts instead of
 * naming one. Set it to false once the real days are in CLASS_TIMETABLES.
 */
export const SISTERS_HIFDH_DAY_PROVISIONAL = true;

/**
 * The timetable a class actually runs on: its own if it has one, otherwise
 * its section's.
 *
 * Every calendar question goes through this rather than through a section,
 * because which weekday hifdh falls on is becoming a fact about the class.
 */
export function timetableFor(section: Section, className?: string | null): Timetable {
  return (className ? CLASS_TIMETABLES[className] : undefined) ?? SECTION_TIMETABLES[section];
}

/**
 * Teaching days lost inside a term — bank holidays, a one-off closure.
 *
 * The gaps BETWEEN terms are not holidays and must not be listed here; they
 * fall out of the term bounds on their own (see `breaks`). This is only for a
 * day that would otherwise be taught. Keyed by date so the picker can say why
 * a normal lesson day is greyed out instead of just swallowing it.
 */
export const HOLIDAYS: Readonly<Record<string, string>> = {
  // "2026-11-02": "Bank holiday",
};

/** Ramadan 1448. It sits wholly inside the Term 2 → Term 3 gap, which is why
 *  that gap is as long as it is; it is named here so the break can say so. */
export const RAMADAN = { startsOn: "2027-02-08", endsOn: "2027-03-08" } as const;

/* ── Events ───────────────────────────────────────────────────────────── */

export type EventKind = "exam" | "ceremony" | "speaker";

export type CalendarEvent = {
  date: string;
  kind: EventKind;
  title: string;
  detail?: string;
  /** Absent means both sections. */
  section?: Section;
};

/**
 * Dated fixtures that are not ordinary lessons.
 *
 * An exam for a term is sat at the START of the following one, which is worth
 * knowing before reading a date here: the Term 2 exam is in Term 3. An event
 * need not fall on a teaching day, and several deliberately do not.
 *
 * ONLY CONFIRMED DATES BELONG HERE. Five more fixtures are known to exist —
 * the Term 1 exam, the end-of-Term-1 and end-of-Term-2 speaker events, the
 * end-of-year exam and the closing ceremony — but no date has been given for
 * any of them, and a guessed date shown to a student is worse than a gap.
 */
export const EVENTS: readonly CalendarEvent[] = [
  {
    date: "2027-03-15",
    kind: "exam",
    title: "Term 2 exam",
    detail: "Sat in person, in the first week of Term 3.",
  },
];

/* ── Date plumbing ────────────────────────────────────────────────────── */

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse YYYY-MM-DD to a LOCAL midday Date. Midday, not midnight, so a DST
 *  boundary can shunt the clock an hour either way without changing the day. */
function fromIso(iso: string): Date | null {
  const m = ISO.exec(iso);
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), 12);
  // Reject the rollovers Date() accepts silently: 2027-02-31 is not a day.
  if (date.getMonth() !== Number(mo) - 1 || date.getDate() !== Number(d)) return null;
  return date;
}

/** The day after `iso`. ISO dates compare as strings, so the rest of this
 *  file never needs to parse; only stepping does. */
function nextDay(iso: string): string {
  const d = fromIso(iso)!;
  d.setDate(d.getDate() + 1);
  return isoDate(d);
}

/* ── Terms ────────────────────────────────────────────────────────────── */

/** The term a date falls inside, or null for a break, a holiday period, or
 *  anything outside the year altogether. */
export function termIdFor(iso: string): TermId | null {
  if (!ISO.test(iso)) return null;
  return TERMS.find((t) => iso >= t.startsOn && iso <= t.endsOn)?.id ?? null;
}

export function termFor(iso: string): Term | null {
  const id = termIdFor(iso);
  return id === null ? null : TERMS.find((t) => t.id === id)!;
}

export type Break = {
  /** Inclusive: the first and last day with no teaching. */
  startsOn: string;
  endsOn: string;
  label: string;
  detail?: string;
};

/**
 * The gaps between terms, derived rather than listed so a break can never
 * disagree with the term bounds on either side of it.
 *
 * Only the names are hand-written — a date range cannot know it is Ramadan.
 */
const BREAK_NAMES: Readonly<Record<number, { label: string; detail?: string }>> = {
  1: { label: "Winter break" },
  2: {
    label: "Ramadan break",
    detail: "Ramadan runs 8 February to 8 March; classes resume after it.",
  },
};

let breaksCache: readonly Break[] | null = null;

export function breaks(): readonly Break[] {
  if (breaksCache) return breaksCache;
  const out: Break[] = [];
  for (let i = 0; i < TERMS.length - 1; i++) {
    const named = BREAK_NAMES[TERMS[i].id] ?? { label: "Break" };
    out.push({
      startsOn: nextDay(TERMS[i].endsOn),
      endsOn: previousDay(TERMS[i + 1].startsOn),
      ...named,
    });
  }
  return (breaksCache = out);
}

function previousDay(iso: string): string {
  const d = fromIso(iso)!;
  d.setDate(d.getDate() - 1);
  return isoDate(d);
}

/** The break a date falls in, if any. Dates outside the year are not in a
 *  break — they are simply not in the year, which reads differently. */
export function breakContaining(iso: string): Break | null {
  if (!ISO.test(iso)) return null;
  return breaks().find((b) => iso >= b.startsOn && iso <= b.endsOn) ?? null;
}

/* ── Sessions ─────────────────────────────────────────────────────────── */

const datesCache = new Map<string, readonly string[]>();

/** Two timetables with the same pair of weekdays produce the same year, so
 *  the cache is keyed on the days rather than on object identity. */
const timetableKey = (tt: Timetable) => `${tt.tajweed}-${tt.hifdh}`;

/**
 * Every date this section is taught, ascending — term-bounded, both subjects
 * interleaved, holidays removed. Generated once per section and reused; the
 * picker asks for this on every render.
 */
export function sessionDates(tt: Timetable): readonly string[] {
  const key = timetableKey(tt);
  const hit = datesCache.get(key);
  if (hit) return hit;

  const days = new Set(SESSION_TYPES.map((s) => tt[s]));
  const out: string[] = [];
  for (const term of TERMS) {
    const end = fromIso(term.endsOn)!;
    for (
      const cursor = fromIso(term.startsOn)!;
      cursor <= end;
      cursor.setDate(cursor.getDate() + 1)
    ) {
      if (!days.has(cursor.getDay())) continue;
      const iso = isoDate(cursor);
      if (iso in HOLIDAYS) continue;
      out.push(iso);
    }
  }
  datesCache.set(key, out);
  return out;
}

/** True only for a date this section is actually taught on. */
export function isSessionDate(iso: string, tt: Timetable): boolean {
  return sessionDates(tt).includes(iso);
}

/**
 * Which of the two weekly sessions a date is for this section, or null if it
 * isn't one of theirs.
 *
 * The date IS the session, so a teacher catching up on Tuesday picks Monday's
 * date, which is the date the register belongs to anyway. What the date can
 * no longer do is answer alone: the same Wednesday is a hifdh session for the
 * sisters and no session at all for the brothers.
 */
export function sessionTypeFor(iso: string, tt: Timetable): SessionType | null {
  if (!isSessionDate(iso, tt)) return null;
  const day = fromIso(iso)!.getDay();
  return SESSION_TYPES.find((s) => tt[s] === day) ?? null;
}

/** Why a would-be teaching day inside a term isn't taught, if it isn't. Null
 *  for taught days, for breaks, and for anything outside the year. */
export function holidayReason(iso: string): string | null {
  return HOLIDAYS[iso] ?? null;
}

/** Events on a date, for a section. Undated-section events belong to both. */
export function eventsOn(iso: string, section: Section): CalendarEvent[] {
  return EVENTS.filter((e) => e.date === iso && (!e.section || e.section === section));
}

/**
 * The session a date should resolve to: itself if it's taught, otherwise the
 * most recent taught date before it. Dates before the year open on its first
 * session, dates after it on its last — the register always has somewhere to
 * land, even when opened in August.
 */
export function nearestSessionDate(iso: string, tt: Timetable): string {
  const dates = sessionDates(tt);
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (!ISO.test(iso) || iso < first) return first;
  if (iso >= last) return last;
  // ISO dates sort as strings, so no parsing is needed to walk backwards.
  for (let i = dates.length - 1; i >= 0; i--) if (dates[i] <= iso) return dates[i];
  return first;
}

/**
 * The session to OPEN ON when nobody has asked for a date — itself if today
 * is a lesson day, otherwise the next one coming.
 *
 * The counterpart to `nearestSessionDate`, and deliberately not a replacement
 * for it. This one answers "which register am I about to take", so a Tuesday
 * resolves forward to Thursday, and a date in the Ramadan break resolves
 * forward to the first session of Term 3. `nearestSessionDate` answers "which
 * real lesson did this typed date mean", and has to keep resolving backwards.
 */
export function nextSessionDate(iso: string, tt: Timetable): string {
  const dates = sessionDates(tt);
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (!ISO.test(iso) || iso <= first) return first;
  if (iso > last) return last;
  for (const d of dates) if (d >= iso) return d;
  return last;
}

/**
 * The taught date immediately before `iso`, or null if it is the year's
 * first. Exists so the register can point at the session behind it: opening
 * on the next lesson means the last one scrolls out of view, and a register
 * nobody filled in is silent otherwise.
 */
export function previousSessionDate(iso: string, tt: Timetable): string | null {
  const dates = sessionDates(tt);
  for (let i = dates.length - 1; i >= 0; i--) if (dates[i] < iso) return dates[i];
  return null;
}

/** Sessions of one subject inside one term — what "how many hifdh sessions
 *  does Term 1 actually have" needs, and the answer is not the span over 7. */
export function termSessions(
  termId: TermId,
  tt: Timetable,
  type?: SessionType,
): readonly string[] {
  const term = TERMS.find((t) => t.id === termId);
  if (!term) return [];
  return sessionDates(tt).filter(
    (d) =>
      d >= term.startsOn &&
      d <= term.endsOn &&
      (!type || sessionTypeFor(d, tt) === type),
  );
}

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** "Mondays & Thursdays" / "Mondays & Wednesdays" — the section's teaching
 *  days named in weekday order, for a UI that has to say which days count. */
export function teachingDaysLabel(tt: Timetable): string {
  return SESSION_TYPES.map((s) => tt[s])
    .sort((a, b) => a - b)
    .map((d) => `${WEEKDAY_NAMES[d]}s`)
    .join(" & ");
}

/** The weekday a timetable sits a subject on, named. */
export function weekdayNameFor(tt: Timetable, type: SessionType): string {
  return WEEKDAY_NAMES[tt[type]];
}
