/**
 * A class's schedule from its rows: the fold behind `getClassSchedule`, kept
 * pure so the live parity check builds exactly what the app builds.
 */
import { scheduleWeeks, weeksForSection, type SectionWeekRow } from "./section-weeks";
import type { ClassRule, ClassSchedule, WeekRow } from "./tree";

export type ScheduleInput = {
  rows: { course_id: string | null; term_id: number; position: number; due_days_after_unlock: number | null; courses: unknown }[];
  items: { course_id: string; ordinal: number; week_number: number }[];
  section: string | null;
  rule: ClassRule | null;
  weeks: WeekRow[];
  sectionWeeks: SectionWeekRow[];
  dates: { course_id: string; ordinal: number; opens_at: string | null; due_at: string | null; held: boolean | null; set_by: string | null; set_at: string }[];
  holds: { course_id: string; from_ordinal: number }[];
  added: { course_id: string; ordinal: number; term_id: number; week_number: number; courses: unknown }[];
};

export function scheduleFromRows(
  { rows, items, section, rule, weeks, sectionWeeks, dates, holds, added }: ScheduleInput,
): ClassSchedule | null {
  if (!rows.length) return null;

  const { firstUnlockByTerm, weeksByTerm } =
    scheduleWeeks(weeksForSection(weeks, sectionWeeks, section));

  const itemWeeks: Record<string, Record<number, number>> = {};
  for (const i of items) (itemWeeks[i.course_id] ??= {})[i.ordinal] = i.week_number;

  const itemDates: NonNullable<ClassSchedule["itemDates"]> = {};
  for (const d of dates) {
    (itemDates[d.course_id] ??= {})[d.ordinal] = {
      opensAt: d.opens_at, dueAt: d.due_at, held: d.held, setBy: d.set_by, setAt: d.set_at,
    };
  }
  const courseHolds: Record<string, number> = {};
  for (const h of holds) courseHolds[h.course_id] = h.from_ordinal;

  // Items of a course the class does not take, added to its weeks: that
  // course joins the schedule carrying only those items.
  const taken = new Set(rows.map((r) => r.course_id));
  const addedCourses = new Map<string, { key: string; label: string; termId: number; ordinals: number[] }>();
  // one term per added course: the earliest term any of its items was added to
  for (const a of [...added].sort((x, y) => x.term_id - y.term_id || x.ordinal - y.ordinal)) {
    if (taken.has(a.course_id)) continue;
    const course = a.courses as unknown as { key: string; label: string } | null;
    if (!course) continue;
    const entry = addedCourses.get(a.course_id) ?? { ...course, termId: a.term_id, ordinals: [] };
    entry.ordinals.push(a.ordinal);
    addedCourses.set(a.course_id, entry);
    (itemWeeks[a.course_id] ??= {})[a.ordinal] = a.week_number;
  }

  return {
    rule,
    itemDates,
    courseHolds,
    courses: [...rows.flatMap((r) => {
      const course = r.courses as unknown as { key: string; label: string } | null;
      if (!course || !r.course_id) return [];
      return [{
        courseId: r.course_id,
        key: course.key,
        label: course.label,
        termId: r.term_id,
        position: r.position,
        dueDaysAfterUnlock: r.due_days_after_unlock,
      }];
    }), ...[...addedCourses.entries()].map(([courseId, a], i) => ({
      courseId, key: a.key, label: a.label, termId: a.termId, position: 90 + i,
      added: true, ordinals: a.ordinals.sort((x, y) => x - y),
    }))],
    firstUnlockByTerm,
    weeksByTerm,
    itemWeeks,
  };
}

/** The class default from its columns; times come back as "HH:MM:SS". */
export function ruleFromRow(r: {
  open_weekday: number | null; open_time: string | null;
  due_weekday: number | null; due_time: string | null; due_weeks_after: number | null;
}): ClassRule | null {
  const open = r.open_weekday !== null && r.open_time ? { weekday: r.open_weekday, time: r.open_time.slice(0, 5) } : null;
  const due = r.due_weekday !== null && r.due_time
    ? { weekday: r.due_weekday, time: r.due_time.slice(0, 5), weeksAfter: r.due_weeks_after ?? 0 } : null;
  return open || due ? { open, due } : null;
}
