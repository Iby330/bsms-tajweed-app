/**
 * Curriculum tree — pure, no IO.
 *
 * The database stores the year flat: weeks belong to terms, and lessons and
 * homeworks each point at a week and carry a `series`. There is no "course"
 * table. A course is the pair (term, series), DERIVED from the rows that
 * actually exist — never assumed, because the year is asymmetric:
 * Umm al-Kitāb is Term 1 only and has no homework, TFP is Term 3 only.
 *
 * Everything here is a pure function so the grouping, ordering and lock rules
 * can be tested without a database. `queries.ts` does the IO.
 */

import { seriesLabel, seriesBlurb, seriesRank } from "@/lib/lessons/series";

/* ── Row shapes (subsets of the tables — only what the screens need) ───── */

export type TermRow = {
  id: number;
  starts_on: string;
  ends_on: string;
  exam_max: number;
};

export type WeekRow = {
  id: string;
  term_id: number;
  number: number;
  unlock_at: string;
  /** Deadline for homework released this week (0043): the Sunday 18:00 after
   *  `unlock_at`. Null only for a row read before the column existed. */
  due_at: string | null;
};

export type LessonRow = {
  id: string;
  week_id: string;
  /** Which course this belongs to (migration 0026). Optional so that fixtures
   *  and any row predating the backfill still typecheck; absent means the row
   *  belongs to no course and a syllabus-driven view will not show it. */
  course_id?: string | null;
  /** Place within that course, from 1. */
  ordinal?: number | null;
  series: string;
  title: string;
  youtube_id: string | null;
  position: number;
};

export type HomeworkRow = {
  id: string;
  week_id: string;
  course_id?: string | null;
  ordinal?: number | null;
  number: number;
  series: string;
  title: string;
  total_marks: number;
  due_at: string | null;
  is_graded: boolean;
};

export type SubStatus = "draft" | "submitted" | "auto_marked" | "approved";

/** One course a class takes, and the term it takes it in. */
export type ScheduledCourse = {
  courseId: string;
  key: string;
  label: string;
  termId: number;
  position: number;
  /**
   * Due this many days after each item opens, in UK local time, instead of
   * with its week (`class_courses.due_days_after_unlock`, 0080). Masjid
   * Al-Aqsa's Umm al-Kitab: opens Thursday 13:00, due the next Thursday 13:00.
   */
  dueDaysAfterUnlock?: number | null;
  /**
   * A course the class does not take, of which the teacher added single items
   * to its weeks (`class_added_items`, 0106). Only `ordinals` belong to the
   * class; the rest of the course stays out of its tree.
   */
  added?: boolean;
  ordinals?: number[];
};

/** One item's own dates for one class (`class_item_dates`, 0106). Null: the
 *  class default, then the week calendar. `held` null: the course hold decides. */
export type ItemDates = {
  opensAt: string | null;
  dueAt: string | null;
  held: boolean | null;
  setBy?: string | null;
  setAt?: string | null;
};

/** A weekday (0 Sunday … 6 Saturday) and a UK wall-clock time, "HH:MM". */
export type WeekdayTime = { weekday: number; time: string };

/**
 * The class default (`classes.open_* / due_*`, 0106). `open`: things open on
 * that weekday and time in the seven days before the week calendar's deadline.
 * `due`: homework is due on that weekday and time after it opens, `weeksAfter`
 * weeks later. Null parts are the week calendar's.
 */
export type ClassRule = {
  open: WeekdayTime | null;
  due: (WeekdayTime & { weeksAfter: number }) | null;
};

/**
 * A class's syllabus — what it studies and when.
 *
 * When this is present the tree is built from it: only scheduled courses
 * appear, they land in the term THE CLASS takes them in rather than the term
 * their rows are filed under, and unlock dates are recomputed to match. When
 * it is absent — the sisters' classes and the demo cohorts, which have no
 * syllabus yet, and any teacher view not scoped to one class — the tree is
 * built exactly as it always was, from (term, series) and the week calendar.
 * That fallback is deliberate: no class loses sight of content it can see
 * today just because nobody has written its syllabus down.
 */
export type ClassSchedule = {
  courses: ScheduledCourse[];
  /**
   * Term id → ISO timestamp of that term's first week unlock. The legacy
   * first-week-plus-seven-days rule, used only when `weeksByTerm` is absent.
   */
  firstUnlockByTerm: Record<number, string>;
  /**
   * Term id → that term's weeks, by `weeks.number`. Item k opens with the
   * week its class meets it in and is due with it, so a week moved by hand
   * (week 1 of 2026/27 opened the night it was ready) moves only its own items.
   */
  weeksByTerm?: Record<number, ScheduleWeek[]>;
  /**
   * Course id → item ordinal → week number, from `class_course_items` (0044):
   * the items this class meets in a week other than item k = week k. Group 1
   * takes several Ghunna, Mudūd and Ṣifāt items a week.
   */
  itemWeeks?: Record<string, Record<number, number>>;
  /** Course id → item ordinal → that item's own dates (0106). */
  itemDates?: Record<string, Record<number, ItemDates>>;
  /** Course id → first held ordinal (`class_homework_holds`, 0090). Teachers
   *  only: the table is teacher-RLS, and a student never receives held rows. */
  courseHolds?: Record<string, number>;
  /** The class default for opening and deadlines (0106). */
  rule?: ClassRule | null;
};

export type ScheduleWeek = { number: number; unlock_at: string; due_at: string | null };

/**
 * The week (by `weeks.number`) a class meets item `ordinal` of a course in:
 * its own listed week, else week k. `class_item_week` in the database.
 */
export function classItemWeek(
  schedule: ClassSchedule, ordinal: number, courseId?: string | null,
): number {
  const k = Math.max(ordinal, 1);
  return (courseId ? schedule.itemWeeks?.[courseId]?.[k] : undefined) ?? k;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * One field of the class's week for an item, as `class_item_unlock_at` /
 * `class_item_due_at` compute it: the week's own value, else past the term's
 * last week the latest value plus seven days per week of overshoot. Undefined
 * when the schedule carries no weeks at all, so the caller can fall back.
 */
function itemWeekField(
  schedule: ClassSchedule, termId: number, ordinal: number,
  courseId: string | null | undefined, field: "unlock_at" | "due_at",
): string | null | undefined {
  if (!schedule.weeksByTerm) return undefined;
  const weeks = schedule.weeksByTerm[termId] ?? [];
  const w = classItemWeek(schedule, ordinal, courseId);
  const own = weeks.find((x) => x.number === w)?.[field];
  if (own) return new Date(Date.parse(own)).toISOString();
  // coalesce's second arm: max(value) + (W - max(number)) weeks
  const values = weeks.map((x) => x[field]).filter((v): v is string => !!v).map(Date.parse);
  if (!values.length) return null;
  const lastNumber = Math.max(...weeks.map((x) => x.number));
  return new Date(Math.max(...values) + (w - lastNumber) * WEEK_MS).toISOString();
}

/** An item's own dates for the class, if the teacher set any. */
export function itemDates(
  schedule: ClassSchedule, ordinal: number, courseId?: string | null,
): ItemDates | undefined {
  return courseId ? schedule.itemDates?.[courseId]?.[Math.max(ordinal, 1)] : undefined;
}

/**
 * Held: hidden from the class, video and homework both. Its own hold, else
 * the course hold. `class_item_held` in the database (0106).
 */
export function itemHeld(
  schedule: ClassSchedule | null | undefined, ordinal: number, courseId?: string | null,
): boolean {
  if (!schedule || !courseId) return false;
  const own = itemDates(schedule, ordinal, courseId)?.held;
  if (own !== null && own !== undefined) return own;
  const from = schedule.courseHolds?.[courseId];
  return from !== undefined && Math.max(ordinal, 1) >= from;
}

/** The week calendar's opening for an item, ignoring every class setting. */
function calendarUnlockAt(
  schedule: ClassSchedule, termId: number, ordinal: number, courseId?: string | null,
): string | null {
  const at = itemWeekField(schedule, termId, ordinal, courseId, "unlock_at");
  if (at !== undefined) return at;
  const first = schedule.firstUnlockByTerm[termId];
  if (!first) return null;
  const ms = Date.parse(first);
  if (Number.isNaN(ms)) return null;
  return new Date(ms + (classItemWeek(schedule, ordinal, courseId) - 1) * WEEK_MS).toISOString();
}

/**
 * The first `weekday` at `time` on the UK clock strictly after `afterIso`,
 * then `weeks` weeks later on the same UK wall clock. `next_weekday_at` (0106).
 */
export function nextWeekdayAt(afterIso: string, weekday: number, time: string, weeks = 0): string {
  const after = Date.parse(afterIso);
  const p = londonParts(after);
  const [h, mi] = time.split(":").map(Number);
  const dow = new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay();
  const diff = (weekday - dow + 7) % 7;
  let at = londonInstant(p.y, p.mo, p.d + diff, h, mi);
  if (at <= after) at = londonInstant(p.y, p.mo, p.d + diff + 7, h, mi);
  const q = londonParts(at);
  return new Date(londonInstant(q.y, q.mo, q.d + 7 * weeks, q.h, q.mi)).toISOString();
}

/** What the class default and the week calendar give an item, before any
 *  date of its own: the "default dates" a teacher can put it back on. */
export function defaultUnlockAt(
  schedule: ClassSchedule, termId: number, ordinal: number, courseId?: string | null,
): string | null {
  const open = schedule.rule?.open;
  if (open) {
    const due = itemWeekField(schedule, termId, ordinal, courseId, "due_at");
    if (due) return nextWeekdayAt(new Date(Date.parse(due) - WEEK_MS).toISOString(), open.weekday, open.time);
  }
  return calendarUnlockAt(schedule, termId, ordinal, courseId);
}

/** The default deadline for an item that opens at `opensAt`. */
export function defaultDueAt(
  schedule: ClassSchedule, termId: number, ordinal: number, courseId: string | null | undefined,
  opensAt: string | null,
): string | null {
  const due = schedule.rule?.due;
  if (due && opensAt) return nextWeekdayAt(opensAt, due.weekday, due.time, due.weeksAfter);
  const days = courseId
    ? schedule.courses.find((c) => c.courseId === courseId)?.dueDaysAfterUnlock
    : null;
  if (days) return opensAt ? addLondonDays(opensAt, days) : null;
  return itemWeekField(schedule, termId, ordinal, courseId, "due_at") ?? null;
}

/**
 * When item `ordinal` of a course opens for a class: its own date, else the
 * class default, else the week it is met in (its `class_course_items` week,
 * else week k), past the term's last week a week at a time.
 *
 * The same rule as `class_item_unlock_at` in the database (0106). The two
 * MUST agree: this one decides what the screen draws, that one decides what
 * RLS will hand over, and a disagreement shows up as a module that renders
 * with nothing in it. Kept in step by `tree.test.ts` and the live parity check.
 */
export function scheduledUnlockAt(
  schedule: ClassSchedule, termId: number, ordinal: number, courseId?: string | null,
): string | null {
  const own = itemDates(schedule, ordinal, courseId)?.opensAt;
  if (own) return new Date(Date.parse(own)).toISOString();
  return defaultUnlockAt(schedule, termId, ordinal, courseId);
}

/**
 * When item `ordinal` of a course is due for a class: its own date, else the
 * class default after it opens, else so many days after it opens (0080), else
 * its week's deadline. `class_item_due_at` (0106). Null without the term's
 * weeks, which the caller reads as "keep the row's own deadline".
 */
export function scheduledDueAt(
  schedule: ClassSchedule, termId: number, ordinal: number, courseId?: string | null,
): string | null {
  const own = itemDates(schedule, ordinal, courseId)?.dueAt;
  if (own) return new Date(Date.parse(own)).toISOString();
  return defaultDueAt(schedule, termId, ordinal, courseId, scheduledUnlockAt(schedule, termId, ordinal, courseId));
}

/** Where an item's date comes from, for the teacher's schedule. */
export function dateSource(
  schedule: ClassSchedule, ordinal: number, courseId: string | null | undefined, field: "opens" | "due",
): "own" | "class" | "calendar" {
  const own = itemDates(schedule, ordinal, courseId);
  if (field === "opens" ? own?.opensAt : own?.dueAt) return "own";
  return (field === "opens" ? schedule.rule?.open : schedule.rule?.due) ? "class" : "calendar";
}

/** A UK wall-clock time as an instant. */
function londonInstant(y: number, mo: number, d: number, h: number, mi: number): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const first = guess - londonOffsetMs(guess);
  return guess - londonOffsetMs(first);
}

/** An instant on the UK clock. */
function londonParts(ms: number): { y: number; mo: number; d: number; h: number; mi: number } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London", hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]),
  );
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute };
}

/** London's offset from UTC at an instant, in ms (BST +1h, GMT 0). */
function londonOffsetMs(ms: number): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London", hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date(ms)).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/**
 * `days` calendar days later at the same UK wall-clock time, as SQL's
 * `((t at time zone 'Europe/London') + n days) at time zone 'Europe/London'`:
 * across the October change, Thursday 13:00 BST is followed by Thursday
 * 13:00 GMT, an hour more than seven times twenty-four.
 */
export function addLondonDays(iso: string, days: number): string {
  const ms = Date.parse(iso);
  const naive = ms + days * 24 * 60 * 60 * 1000;
  return new Date(naive + londonOffsetMs(ms) - londonOffsetMs(naive)).toISOString();
}

/**
 * Homework rows with each deadline moved to the class's own, as
 * `homework_due_for` gives it: a homework of a course the class takes is due
 * with the week the class meets it in. Anything else keeps the row's date,
 * which for a class with no syllabus already is its week's deadline.
 */
export function withClassDeadlines(
  homeworks: HomeworkRow[], schedule: ClassSchedule | null | undefined,
): HomeworkRow[] {
  if (!schedule?.courses.length) return homeworks;
  const termOf = new Map(schedule.courses.map((c) => [c.courseId, c.termId]));
  return homeworks.map((h) => {
    const termId = h.course_id ? termOf.get(h.course_id) : undefined;
    if (termId === undefined) return h;
    // greatest(null, 1) is 1 in SQL: an item with no ordinal is the first
    const due = scheduledDueAt(schedule, termId, h.ordinal ?? 1, h.course_id);
    return due === null ? h : { ...h, due_at: due };
  });
}

export type CurriculumRows = {
  terms: TermRow[];
  weeks: WeekRow[];
  lessons: LessonRow[];
  homeworks: HomeworkRow[];
};

/* ── Tree shapes ──────────────────────────────────────────────────────── */

/**
 * A homework the teacher sent back for another go: which attempt the student
 * is on now, and what the attempt before it scored (null only for a row that
 * predates `previous_pct` being recorded).
 */
export type RedoInfo = { attempt: number; previousPct: number | null };

export type Module = {
  weekId: string;
  weekNumber: number;
  unlockAt: string;
  unlocked: boolean;
  /** Human title for the week, cleaned of the "Tajweed 3 — " style prefix. */
  title: string;
  lessons: LessonRow[];
  homework: HomeworkRow | null;
  /** Progress — all false/null until overlayProgress runs. */
  watched: boolean;
  submission: SubStatus | null;
  /** Set when this module's homework is on attempt 2 or later. */
  redo: RedoInfo | null;
  /**
   * Is there anything here the student can actually do? False when the video
   * has not been uploaded AND there is no homework. Such a module is neither
   * complete nor outstanding — it is empty, and counting it either way would
   * misreport progress.
   */
  actionable: boolean;
  done: boolean;
  /** Hidden from the class until the teacher releases it (0106). */
  held?: boolean;
};

export type Course = {
  termId: number;
  series: string;
  label: string;
  blurb: string;
  modules: Module[];
  moduleCount: number;
  unlockedCount: number;
  /** Modules with something to do — the honest progress denominator. */
  actionableCount: number;
  doneCount: number;
  hasHomework: boolean;
  /**
   * When this course's first item opens FOR THIS READER — which the tree can
   * answer even when the reader cannot yet see the item itself.
   *
   * That is the whole reason it is here. Post-0027 RLS hands a student only
   * the rows their syllabus has already released, so a course they take next
   * term arrives as an empty shell with no module to read a date off. The
   * course index still has to say "Opens 15 March", and under a syllabus that
   * date is the class's, not the one on the rows' own weeks.
   */
  opensAt: string | null;
  /** First unlocked module still outstanding. Null when finished or all locked. */
  nextModule: Module | null;
};

export type Term = {
  id: number;
  startsOn: string;
  endsOn: string;
  examMax: number;
  isCurrent: boolean;
  courses: Course[];
  /** Modules VISIBLE to this reader — see lockedWeeks. */
  moduleCount: number;
  /** Visible modules with something to do — the progress denominator. */
  actionableCount: number;
  doneCount: number;
  /** Every week in the term, released or not. */
  weekCount: number;
  /**
   * Weeks that have not unlocked yet, straight from the calendar.
   *
   * Students cannot read locked lessons or homeworks at all — the RLS
   * policies `s_lessons_unlocked` / `s_homeworks_unlocked` filter those rows
   * out — so `moduleCount` is "released so far", not "the whole course".
   * `weeks` IS readable, which makes this the only honest way to tell a
   * student more is coming. It deliberately says nothing about WHICH course
   * a locked week belongs to, because that genuinely isn't knowable here.
   */
  lockedWeeks: { number: number; unlockAt: string }[];
};

export type StudentProgress = {
  watchedLessonIds: Set<string>;
  submissionByHomeworkId: Map<string, SubStatus>;
  /**
   * Homeworks the teacher has sent back, by homework id — present only for
   * attempts past the first. Optional because every reader that has no
   * business knowing (the teacher's tree, the fixtures) should not have to
   * pass an empty map to say so.
   */
  redoByHomeworkId?: Map<string, RedoInfo>;
};

/* ── Titles ───────────────────────────────────────────────────────────── */

/**
 * Seed titles carry their own scaffolding — "Tajweed 3 — Tajweed Homework 3:
 * Idhaar Halqy". On a screen that already says "Tajweed" and "Week 3", all of
 * that is noise, so strip the series+number prefix and the homework label.
 *
 * Returns "" when nothing meaningful survives. The TFP titles really are just
 * "The 10 Fundamental Principles: HW 1" — a course name and a number, no title
 * at all — and printing "HW 1" as a heading next to "Week 1" would be worse
 * than printing nothing. Callers fall back to the week number.
 */
export function moduleTitle(raw: string): string {
  let out = raw.trim();
  // "Tajweed 3: …" / "Umm al-Kitab 7 — …". The separator varies by import
  // route: the SQL seed writes an em dash, the live Forms import writes a
  // colon. Both are in the wild, so accept either.
  out = out.replace(/^[^:—–]{0,40}?\s\d+\s*[:—–]\s*/u, "");
  // "Tajweed Homework 3: …" / "Homework: …"
  out = out.replace(/^[\w' -]{0,48}?\b(?:homework|hw)\b\s*\d*\s*[:.\-–—]\s*/iu, "");
  // "<course name>: HW 1" — drop the name, leaving only the bare number
  out = out.replace(/^[^:]{0,60}:\s*(?=(?:hw|homework)\s*\d*\s*$)/iu, "");
  out = out.trim();
  // a bare "HW 1" is a number, not a title
  if (/^(?:hw|homework)\s*\d*$/iu.test(out)) return "";
  return out || raw.trim();
}

/* ── Build ────────────────────────────────────────────────────────────── */

type Bucket = { lessons: LessonRow[]; homework: HomeworkRow | null };

export function buildTree(
  rows: CurriculumRows,
  now: Date = new Date(),
  schedule?: ClassSchedule | null,
  /**
   * `profiles.unlock_all` — the demo/preview flag from migration 0023, which
   * the database reads as `sees_all_content()` and ORs into the content
   * policies. Such a reader is handed every lesson and homework row there is,
   * so this tree must stop applying the two gates the database has already
   * waived for them: the class syllabus and the release calendar. Without
   * that, RLS returns the whole year and the screen greys it out — which is
   * exactly the state the flag exists to prevent.
   *
   * It is deliberately NOT the teacher path. A teacher gets the locked rows
   * and is SHOWN the locks, because knowing what has not opened yet is the
   * point of preparing next term. An exempt reader is walking a student
   * journey, so for them nothing is locked at all.
   */
  unlockAll = false,
): Term[] {
  const nowMs = now.getTime();
  const weekById = new Map(rows.weeks.map((w) => [w.id, w]));

  // Courses this class takes, by the course id the rows carry. Empty when
  // there is no syllabus, which is what puts the whole function back on its
  // original (term, series) footing — and so does `unlockAll`, because a
  // reader exempt from the syllabus is by definition on the whole programme.
  const scheduled = new Map((schedule?.courses ?? []).map((c) => [c.courseId, c]));
  const useSyllabus = !unlockAll && scheduled.size > 0;

  // key → weekId → bucket. The key is the course id under a syllabus and the
  // old (termId, series) pair without one.
  const byCourse = new Map<string, Map<string, Bucket>>();
  const key = (termId: number, series: string) => `${termId} ${series}`;

  /**
   * Which bucket a row belongs to, and null when it belongs to none.
   *
   * Under a syllabus a row is dropped unless the class actually takes its
   * course — that is the filtering the whole change exists for — and it is
   * bucketed by COURSE, so the same Mudūd rows can sit in Term 1 for one
   * class and Term 3 for another.
   */
  const bucketFor = (
    weekId: string, series: string, courseId: string | null | undefined, ordinal?: number | null,
  ): Bucket | null => {
    const week = weekById.get(weekId);
    if (!week) return null; // orphan row — a week that no longer exists
    let k: string;
    if (useSyllabus) {
      if (!courseId || !scheduled.has(courseId)) return null;
      // an added course brings only the items the teacher added
      const only = scheduled.get(courseId)!.ordinals;
      if (only && !only.includes(Math.max(ordinal ?? 1, 1))) return null;
      k = courseId;
    } else {
      k = key(week.term_id, series);
    }
    let weeks = byCourse.get(k);
    if (!weeks) byCourse.set(k, (weeks = new Map()));
    let bucket = weeks.get(weekId);
    if (!bucket) weeks.set(weekId, (bucket = { lessons: [], homework: null }));
    return bucket;
  };

  for (const l of rows.lessons) bucketFor(l.week_id, l.series, l.course_id, l.ordinal)?.lessons.push(l);
  for (const h of rows.homeworks) {
    const bucket = bucketFor(h.week_id, h.series, h.course_id, h.ordinal);
    if (bucket) bucket.homework = h;
  }

  const currentTermId = resolveCurrentTerm(rows.terms, nowMs);
  const terms = [...rows.terms].sort((a, b) => a.id - b.id);
  const weeksByTerm = new Map<number, WeekRow[]>();
  for (const w of rows.weeks) {
    const list = weeksByTerm.get(w.term_id) ?? [];
    list.push(w);
    weeksByTerm.set(w.term_id, list);
  }

  return terms.map((t) => {
    const courses: Course[] = [];
    const termWeeks = (weeksByTerm.get(t.id) ?? []).sort((a, b) => a.number - b.number);

    for (const [k, weeks] of byCourse) {
      // Which term this course sits in for this reader: the syllabus decides
      // under a class, the row's own week decides without one.
      const sched = useSyllabus ? scheduled.get(k) : undefined;
      const [termPart, seriesPart] = k.split(" ");
      const series = useSyllabus ? (sched?.key ?? "") : seriesPart;
      if (useSyllabus) {
        if (!sched || sched.termId !== t.id) continue;
      } else if (Number(termPart) !== t.id) {
        continue;
      }

      const modules: Module[] = [...weeks.entries()]
        .map(([weekId, bucket]) => {
          const week = weekById.get(weekId)!;
          const lessons = [...bucket.lessons].sort((a, b) => a.position - b.position);
          const source = lessons[0]?.title ?? bucket.homework?.title ?? "";
          // Under a syllabus the unlock date is recomputed from the term the
          // CLASS takes this course in. That is the point of the whole change:
          // group 1's Mudūd rows are filed in Term 3 and have to open in Term
          // 1 for them alone, without moving a row. `ordinal` is the item's
          // place in its course; the week number is the fallback for any row
          // that missed the 0026 backfill, which keeps it behaving as before.
          const ordinal = lessons[0]?.ordinal ?? bucket.homework?.ordinal ?? week.number;
          const unlockAt =
            (schedule && sched
              ? scheduledUnlockAt(schedule, sched.termId, ordinal, sched.courseId)
              : null)
            ?? week.unlock_at;
          const held = !!(schedule && sched) && itemHeld(schedule, ordinal, sched.courseId);
          return {
            ordinal,
            module: {
              weekId,
              // the week the class meets it in, which under group 1's schedule
              // is not the item's number
              weekNumber: schedule && sched
                ? classItemWeek(schedule, ordinal, sched.courseId)
                : week.number,
              unlockAt,
              // The date is left as it is and only the verdict changes, so a
              // screen that wants to say WHEN something opened still can. A
              // held item is shut whatever its date says.
              unlocked: unlockAll || (!held && Date.parse(unlockAt) <= nowMs),
              held,
              title: moduleTitle(source),
              lessons,
              homework: bucket.homework,
              watched: false,
              submission: null,
              redo: null,
              actionable: lessons.some((l) => l.youtube_id) || bucket.homework !== null,
              done: false,
            } satisfies Module,
          };
        })
        // several items can share a class week; they keep their course order
        .sort((a, b) => a.module.weekNumber - b.module.weekNumber || a.ordinal - b.ordinal)
        .map((x) => x.module);

      if (modules.length === 0) continue;

      courses.push({
        termId: t.id,
        // The course key stands in for the series under a syllabus: a course
        // now has an identity of its own and should not be forced back
        // through the series vocabulary it replaces.
        series,
        label: sched ? sched.label : seriesLabel(series),
        blurb: sched ? "" : seriesBlurb(series),
        modules,
        moduleCount: modules.length,
        unlockedCount: modules.filter((m) => m.unlocked).length,
        actionableCount: modules.filter((m) => m.actionable).length,
        doneCount: 0,
        hasHomework: modules.some((m) => m.homework !== null),
        opensAt: modules[0]?.unlockAt ?? null,
        nextModule: null,
      });
    }

    // A scheduled course the app holds NOTHING for — Qāʿidah Nūrāniyyah,
    // Makhārij, the new Ṣifāt — still gets an entry, empty. Masjid Al-Aqsa's
    // whole of Term 1 is one such course, and dropping it would leave them a
    // blank screen that reads as the app being broken rather than as content
    // that does not exist yet.
    if (useSyllabus) {
      for (const sc of scheduled.values()) {
        if (sc.termId !== t.id) continue;
        if (courses.some((c) => c.series === sc.key)) continue;
        courses.push({
          termId: t.id, series: sc.key, label: sc.label, blurb: "",
          modules: [], moduleCount: 0, unlockedCount: 0, actionableCount: 0,
          doneCount: 0, hasHomework: false,
          // Empty because the rows are still locked, or empty because the
          // course has no content at all — this date cannot tell the two
          // apart, and does not need to: the index pairs it with the
          // catalogue, which knows whether there is anything behind it.
          opensAt: schedule ? scheduledUnlockAt(schedule, sc.termId, 1, sc.courseId) : null,
          nextModule: null,
        });
      }
      // The syllabus's own order within the term, not the series ranking.
      const posOf = (c: Course) =>
        [...scheduled.values()].find((s) => s.key === c.series)?.position ?? 0;
      courses.sort((a, b) => posOf(a) - posOf(b) || a.label.localeCompare(b.label));
    } else {
      courses.sort(
        (a, b) => seriesRank(a.series) - seriesRank(b.series) || a.series.localeCompare(b.series),
      );
    }

    return {
      id: t.id,
      startsOn: t.starts_on,
      endsOn: t.ends_on,
      examMax: t.exam_max,
      isCurrent: t.id === currentTermId,
      courses,
      moduleCount: courses.reduce((n, c) => n + c.moduleCount, 0),
      actionableCount: courses.reduce((n, c) => n + c.actionableCount, 0),
      doneCount: 0,
      weekCount: termWeeks.length,
      // "Week 4 unlocks 26 October" is a promise, and there is nothing to
      // promise a reader who already has it.
      lockedWeeks: unlockAll ? [] : termWeeks
        .filter((w) => Date.parse(w.unlock_at) > nowMs)
        .map((w) => ({ number: w.number, unlockAt: w.unlock_at })),
    } satisfies Term;
  });
}

/** The term containing `now`; between terms, the most recent one to have started. */
function resolveCurrentTerm(terms: TermRow[], nowMs: number): number | null {
  const inside = terms.find(
    (t) => Date.parse(t.starts_on) <= nowMs && nowMs <= Date.parse(t.ends_on),
  );
  if (inside) return inside.id;
  const started = terms
    .filter((t) => Date.parse(t.starts_on) <= nowMs)
    .sort((a, b) => Date.parse(a.starts_on) - Date.parse(b.starts_on));
  return started.length ? started[started.length - 1].id : null;
}

/* ── Progress ─────────────────────────────────────────────────────────── */

/** The student has done their part once it leaves draft — marking is the
 *  teacher's job, and a slow teacher must not stall a student's progress. */
const HANDED_IN: SubStatus[] = ["submitted", "auto_marked", "approved"];

export function overlayProgress(terms: Term[], progress: StudentProgress): Term[] {
  return terms.map((term) => {
    const courses = term.courses.map((course) => {
      const modules = course.modules.map((m) => {
        const submission = m.homework
          ? progress.submissionByHomeworkId.get(m.homework.id) ?? null
          : null;
        const redo = m.homework
          ? progress.redoByHomeworkId?.get(m.homework.id) ?? null
          : null;

        // Most videos are not uploaded yet — youtube_id stays null until the
        // channel re-uploads. A lesson nobody CAN watch must not pin a student
        // at 0% forever, so only watchable lessons gate completion.
        const watchable = m.lessons.filter((l) => l.youtube_id);
        const watched =
          watchable.length > 0 &&
          watchable.every((l) => progress.watchedLessonIds.has(l.id));

        const lessonsDone = watchable.length === 0 || watched;
        const homeworkDone = !m.homework || HANDED_IN.includes(submission!);
        const actionable = watchable.length > 0 || m.homework !== null;
        return {
          ...m,
          watched,
          submission,
          redo,
          actionable,
          done: actionable && lessonsDone && homeworkDone,
        } satisfies Module;
      });

      const doneCount = modules.filter((m) => m.done).length;
      return {
        ...course,
        modules,
        actionableCount: modules.filter((m) => m.actionable).length,
        doneCount,
        // an empty module is not "outstanding" — never send a student to one
        nextModule: modules.find((m) => m.unlocked && m.actionable && !m.done) ?? null,
      } satisfies Course;
    });

    return {
      ...term,
      courses,
      actionableCount: courses.reduce((n, c) => n + c.actionableCount, 0),
      doneCount: courses.reduce((n, c) => n + c.doneCount, 0),
    } satisfies Term;
  });
}

/* ── Homework worklist ────────────────────────────────────────────────── */

export type HomeworkEntry = {
  termId: number;
  series: string;
  courseLabel: string;
  weekNumber: number;
  /** The module's cleaned title — may be empty. */
  title: string;
  unlocked: boolean;
  homework: HomeworkRow;
  submission: SubStatus | null;
  redo: RedoInfo | null;
};

/** Every homework in the year, flattened out of the tree in teaching order
 *  but carrying its course context, so no row is ever context-free. */
export function listHomework(terms: Term[]): HomeworkEntry[] {
  const out: HomeworkEntry[] = [];
  for (const term of terms) {
    for (const course of term.courses) {
      for (const m of course.modules) {
        if (!m.homework) continue;
        out.push({
          termId: term.id,
          series: course.series,
          courseLabel: course.label,
          weekNumber: m.weekNumber,
          title: m.title,
          unlocked: m.unlocked,
          homework: m.homework,
          submission: m.submission,
          redo: m.redo,
        });
      }
    }
  }
  return out.sort(
    (a, b) => a.termId - b.termId || a.weekNumber - b.weekNumber || a.homework.number - b.homework.number,
  );
}

export type HomeworkBuckets = {
  /** Released and still on the student's plate. */
  needsYou: HomeworkEntry[];
  /** Handed in, waiting on a teacher. */
  withTeacher: HomeworkEntry[];
  /** Approved — newest first, so the latest result is at the top. */
  marked: HomeworkEntry[];
  /** Not released yet. Shown as a count, not a to-do list. */
  upcoming: HomeworkEntry[];
};

export function bucketHomework(entries: HomeworkEntry[]): HomeworkBuckets {
  const buckets: HomeworkBuckets = {
    needsYou: [], withTeacher: [], marked: [], upcoming: [],
  };

  for (const e of entries) {
    if (e.submission === "approved") buckets.marked.push(e);
    else if (e.submission === "submitted" || e.submission === "auto_marked")
      buckets.withTeacher.push(e);
    else if (!e.unlocked) buckets.upcoming.push(e);
    else buckets.needsYou.push(e);
  }

  buckets.marked.reverse();
  return buckets;
}

/* ── Lookups ──────────────────────────────────────────────────────────── */

/**
 * One week's content, straight from the flat rows.
 *
 * Home asks a question the tree cannot answer cheaply: "what is on this
 * week?", across every course at once. In the tree those rows are scattered
 * over one module per (term, series) pair, so answering from it means knowing
 * which courses run that week before you can look. The rows know already.
 *
 * Homeworks are a LIST, not a single row — Term 3 week 1 carries both Tajweed
 * 16 and TFP 1, and a week with two courses running has two.
 */
export function weekContent(
  rows: Pick<CurriculumRows, "lessons" | "homeworks">,
  weekId: string,
): { lessons: LessonRow[]; homeworks: HomeworkRow[] } {
  return {
    lessons: rows.lessons
      .filter((l) => l.week_id === weekId)
      .sort((a, b) => a.position - b.position),
    homeworks: rows.homeworks
      .filter((h) => h.week_id === weekId)
      .sort((a, b) => a.number - b.number),
  };
}

/**
 * The modules that opened most recently — "this week" for whoever this tree
 * was built for.
 *
 * Read off the TREE rather than by matching `week_id`, which is the only way
 * it can be right since the per-class syllabus: group 1 takes Mudūd in Term 1
 * but its rows are filed against Term 3's weeks, so a week-id match finds
 * nothing for them and their current work silently disappears from Home.
 *
 * Returns every module sharing the latest unlocked date, because a week
 * carries more than one course — Term 3 week 1 has both Mudūd and Mabādi'.
 */
export function currentModules(terms: Term[], now: Date = new Date()): Module[] {
  const nowMs = now.getTime();
  let latest = Number.NEGATIVE_INFINITY;
  for (const t of terms) {
    for (const c of t.courses) {
      for (const m of c.modules) {
        const at = Date.parse(m.unlockAt);
        if (at <= nowMs && at > latest) latest = at;
      }
    }
  }
  if (latest === Number.NEGATIVE_INFINITY) {
    // Nothing has opened by the clock. For a real student that is the honest
    // answer and Home says the year has not started. A reader exempt from the
    // calendar (`profiles.unlock_all`) has every module marked unlocked while
    // its date is still months away, and showing them an empty week would
    // defeat the flag — so fall back to the earliest module they can open.
    let earliest = Number.POSITIVE_INFINITY;
    for (const t of terms) {
      for (const c of t.courses) {
        for (const m of c.modules) {
          const at = Date.parse(m.unlockAt);
          if (m.unlocked && at < earliest) earliest = at;
        }
      }
    }
    if (earliest === Number.POSITIVE_INFINITY) return [];
    latest = earliest;
  }
  const out: Module[] = [];
  for (const t of terms) {
    for (const c of t.courses) {
      for (const m of c.modules) {
        if (Date.parse(m.unlockAt) === latest) out.push(m);
      }
    }
  }
  return out;
}

/**
 * The homework Home shows as cards of its own, beside the lesson cards.
 *
 * Home reaches a homework through its lesson, which leaves two kinds with no
 * way on: a homework-only week (Qāʿidah is taught live, so its weeks have a
 * homework and no lesson), and last week's homework once the next week opens
 * before it is due — content opens on a Thursday, and week 1's deadline fell
 * that evening. The first is shown while its week is current; the second until
 * it is handed in or its deadline passes, when the overdue box takes it.
 */
export function homeHomework(terms: Term[], now: Date = new Date()): HomeworkEntry[] {
  const open = new Set(currentModules(terms, now));
  const current = new Set<string>();
  const onLesson = new Set<string>();
  for (const m of open) {
    if (!m.homework) continue;
    current.add(m.homework.id);
    if (m.lessons.length) onLesson.add(m.homework.id);
  }
  return listHomework(terms).filter((e) => {
    if (onLesson.has(e.homework.id)) return false;
    if (current.has(e.homework.id)) return true;
    const handedIn =
      e.submission === "submitted" || e.submission === "auto_marked" || e.submission === "approved";
    return (
      e.unlocked && !handedIn && !e.redo &&
      e.homework.due_at !== null && Date.parse(e.homework.due_at) > now.getTime()
    );
  });
}

export function findTerm(terms: Term[], termId: number): Term | null {
  return terms.find((t) => t.id === termId) ?? null;
}

export function findCourse(terms: Term[], termId: number, series: string): Course | null {
  return findTerm(terms, termId)?.courses.find((c) => c.series === series) ?? null;
}

/**
 * Where the year is right now: the most recently opened module anywhere.
 *
 * It asks the calendar rather than `m.unlocked`, and the difference only
 * shows for a reader exempt from the calendar (`unlockAll`), for whom every
 * module is unlocked and the answer would otherwise be the last week of the
 * year. "This week" is a date; it is not a permission.
 */
export function findCurrentModule(
  terms: Term[],
  now: Date = new Date(),
): { termId: number; series: string; module: Module } | null {
  const nowMs = now.getTime();
  let best: { termId: number; series: string; module: Module } | null = null;
  let bestMs = -Infinity;

  for (const term of terms) {
    for (const course of term.courses) {
      for (const m of course.modules) {
        const ms = Date.parse(m.unlockAt);
        if (ms > nowMs) continue;
        if (ms > bestMs) {
          bestMs = ms;
          best = { termId: term.id, series: course.series, module: m };
        }
      }
    }
  }
  return best;
}
