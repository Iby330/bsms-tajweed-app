/**
 * Date helpers for the teacher's schedule. Everything is shown on the UK
 * clock, whatever the reader's own: the classes run on it, and a server render
 * in UTC must read the same as the browser's.
 */
import {
  classItemTerm, classItemWeek, dateSource, defaultDueAt, defaultUnlockAt, itemDates, itemHeld,
  nextWeekdayAt, scheduledDueAt, scheduledUnlockAt, type ClassRule, type ClassSchedule, type WeekdayTime,
} from "@/lib/curriculum/tree";

const TZ = "Europe/London";
const full = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const short = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short" });
const partsFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

/** "Thu 15 Oct, 20:15". */
export const when = (iso: string | null | undefined) => (iso ? full.format(new Date(iso)).replace(" at ", ", ") : "");
/** "15 Oct". */
export const day = (iso: string) => short.format(new Date(iso));
const weekdayShort = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
/** A class date ("2026-11-19") as "Thu 19 Nov", read at UK midday so no clock moves it a day. */
export const classDay = (date: string) => weekdayShort.format(new Date(`${date}T12:00:00Z`));
/** Today on the UK clock, "2026-11-22". */
export function londonToday(nowIso: string): string {
  const p = londonParts(Date.parse(nowIso));
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}`;
}

export function londonParts(ms: number) {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute };
}
function offset(ms: number) {
  const p = londonParts(ms);
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - (ms - (ms % 60000));
}
/** A UK wall-clock time as an ISO instant. */
export function londonIso(y: number, mo: number, d: number, h: number, mi: number): string {
  const g = Date.UTC(y, mo - 1, d, h, mi);
  return new Date(g - offset(g - offset(g))).toISOString();
}
export const pad = (n: number) => String(n).padStart(2, "0");

/** "in 3 days" / "2 hours ago". */
export function rel(iso: string, nowIso: string): string {
  const diff = Date.parse(iso) - Date.parse(nowIso), a = Math.abs(diff);
  const h = Math.round(a / 3600000), d = Math.round(a / 86400000);
  const s = a < 3600000 ? "under an hour" : h < 36 ? `${h} hour${h === 1 ? "" : "s"}` : `${d} day${d === 1 ? "" : "s"}`;
  return diff >= 0 ? `in ${s}` : `${s} ago`;
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The week calendar's own pattern, which the default box starts from. */
export const SECTION_DEFAULT: Record<string, { open: WeekdayTime; due: WeekdayTime & { weeksAfter: number } }> = {
  brothers: { open: { weekday: 4, time: "13:00" }, due: { weekday: 1, time: "14:00", weeksAfter: 0 } },
  sisters: { open: { weekday: 3, time: "18:00" }, due: { weekday: 2, time: "18:00", weeksAfter: 0 } },
};
export function ruleShown(schedule: ClassSchedule, section: string) {
  const def = SECTION_DEFAULT[section] ?? SECTION_DEFAULT.brothers;
  return { open: schedule.rule?.open ?? def.open, due: schedule.rule?.due ?? def.due };
}
/** The rule to store: a part equal to the calendar's is the calendar's (null). */
export function ruleToStore(section: string, open: WeekdayTime, due: WeekdayTime & { weeksAfter: number }): ClassRule | null {
  const def = SECTION_DEFAULT[section] ?? SECTION_DEFAULT.brothers;
  const same = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b);
  const r = { open: same(open, def.open) ? null : open, due: same(due, def.due) ? null : due };
  return r.open || r.due ? r : null;
}

/** Where one item stands for the class. */
export type ItemState = {
  /** The term the class meets it in: its own when the teacher put it in another (0153). */
  termId: number;
  /** The term its course sits in for the class. */
  courseTermId: number;
  /** A week of `termId`. */
  week: number;
  opens: string | null;
  due: string | null;
  held: boolean;
  opensSrc: "own" | "class" | "calendar";
  dueSrc: "own" | "class" | "calendar";
  own: ReturnType<typeof itemDates>;
};
export function itemState(schedule: ClassSchedule, courseId: string, ordinal: number, hasHomework: boolean): ItemState {
  const sc = schedule.courses.find((c) => c.courseId === courseId)!;
  return {
    termId: classItemTerm(schedule, sc.termId, ordinal, courseId),
    courseTermId: sc.termId,
    week: classItemWeek(schedule, ordinal, courseId),
    opens: scheduledUnlockAt(schedule, sc.termId, ordinal, courseId),
    due: hasHomework ? scheduledDueAt(schedule, sc.termId, ordinal, courseId) : null,
    held: itemHeld(schedule, ordinal, courseId),
    opensSrc: dateSource(schedule, ordinal, courseId, "opens"),
    dueSrc: dateSource(schedule, ordinal, courseId, "due"),
    own: itemDates(schedule, ordinal, courseId),
  };
}
/** The dates an item would go back to. */
export function defaults(schedule: ClassSchedule, courseId: string, ordinal: number) {
  const sc = schedule.courses.find((c) => c.courseId === courseId)!;
  const opens = defaultUnlockAt(schedule, sc.termId, ordinal, courseId);
  return { opens, due: defaultDueAt(schedule, sc.termId, ordinal, courseId, opens) };
}
/** The next class at the class's due time, after `afterIso`. */
export function nextClassAt(schedule: ClassSchedule, section: string, afterIso: string): string {
  const due = ruleShown(schedule, section).due;
  return nextWeekdayAt(afterIso, due.weekday, due.time, 0);
}

export type Status = { tone: "held" | "soon" | "open" | "closed"; text: string };
export function status(s: ItemState, hasHomework: boolean, nowIso: string): Status {
  if (s.held) return { tone: "held", text: "Held" };
  if (s.opens && s.opens > nowIso) return { tone: "soon", text: `Opens ${rel(s.opens, nowIso)}` };
  if (!hasHomework) return { tone: "open", text: "Open" };
  if (s.due && s.due > nowIso) return { tone: "open", text: `Open · due ${rel(s.due, nowIso)}` };
  return { tone: "closed", text: "Deadline passed" };
}
