/**
 * A section's own week calendar (0052) — pure, no IO.
 *
 * `section_weeks` gives a section its own unlock/due for a week; where it has
 * no row the week's own times stand. The sisters have a row for every week
 * (Wednesday 19:00 to Wednesday 19:00), the brothers none. The rule lives in
 * the rows, never here: these helpers only apply them, the same way
 * `can_see_content`, `homework_due_for` and `class_item_*_at` do in SQL.
 */

import {
  withClassDeadlines, type ClassSchedule, type CurriculumRows, type ScheduleWeek, type WeekRow,
} from "./tree";

export type SectionWeekRow = {
  section: string;
  week_id: string;
  unlock_at: string;
  due_at: string;
};

/** `section_weeks` rows of one section, keyed by week id. */
export function sectionWeekRows(sectionWeeks: SectionWeekRow[], section: string | null | undefined) {
  const out = new Map<string, SectionWeekRow>();
  if (!section) return out;
  for (const r of sectionWeeks) if (r.section === section) out.set(r.week_id, r);
  return out;
}

/**
 * The weeks as `section` reads them: its unlock/due where it has a row, the
 * week's own otherwise. Order is kept, so `currentWeek` still works off it.
 * No section (a teacher with no class in scope) gets the shared weeks.
 */
export function weeksForSection<W extends { id: string; unlock_at: string; due_at: string | null }>(
  weeks: W[],
  sectionWeeks: SectionWeekRow[],
  section: string | null | undefined,
): W[] {
  const mine = sectionWeekRows(sectionWeeks, section);
  if (mine.size === 0) return weeks;
  return weeks.map((w) => {
    const r = mine.get(w.id);
    return r ? { ...w, unlock_at: r.unlock_at, due_at: r.due_at } : w;
  });
}

/**
 * Homework deadlines for a reader WITHOUT a syllabus, as `homework_due_for`
 * stamps them: the section's due for the homework's week where it has a row,
 * else the homework's own `due_at` (not the week's — the SQL falls back to
 * `h.due_at`). A syllabus reader goes through `withClassDeadlines` instead.
 */
export function withSectionDeadlines<H extends { week_id: string; due_at: string | null }>(
  homeworks: H[],
  sectionWeeks: SectionWeekRow[],
  section: string | null | undefined,
): H[] {
  const mine = sectionWeekRows(sectionWeeks, section);
  if (mine.size === 0) return homeworks;
  return homeworks.map((h) => {
    const r = mine.get(h.week_id);
    return r ? { ...h, due_at: r.due_at } : h;
  });
}

/**
 * The flat curriculum rows as one reader sees the calendar: their section's
 * weeks, and each homework due when `homework_due_for` would stamp it — the
 * class's syllabus week where `schedule` covers it, else the section's week,
 * else the row's own. The order is the SQL coalesce's, so the class wins.
 *
 * Pass `schedule` only when the tree is built from it (a syllabus reader);
 * null keeps the no-syllabus path.
 */
export function rowsForSection(
  rows: CurriculumRows,
  sectionWeeks: SectionWeekRow[],
  section: string | null | undefined,
  schedule: ClassSchedule | null | undefined,
): CurriculumRows {
  return {
    ...rows,
    weeks: weeksForSection(rows.weeks, sectionWeeks, section),
    homeworks: withClassDeadlines(withSectionDeadlines(rows.homeworks, sectionWeeks, section), schedule),
  };
}

/**
 * A class schedule's calendar, from weeks already put on the class's section
 * (`weeksForSection`): each term's weeks by number, and its first unlock.
 * What `class_item_unlock_at` / `class_item_due_at` read, so a sisters'
 * syllabus item opens and falls due on their Wednesday.
 */
export function scheduleWeeks(weeks: WeekRow[]): Pick<ClassSchedule, "firstUnlockByTerm"> & {
  weeksByTerm: Record<number, ScheduleWeek[]>;
} {
  const firstUnlockByTerm: Record<number, string> = {};
  const weeksByTerm: Record<number, ScheduleWeek[]> = {};
  for (const w of weeks) {
    const at = firstUnlockByTerm[w.term_id];
    if (!at || Date.parse(w.unlock_at) < Date.parse(at)) firstUnlockByTerm[w.term_id] = w.unlock_at;
    (weeksByTerm[w.term_id] ??= [])
      .push({ number: w.number, unlock_at: w.unlock_at, due_at: w.due_at ?? null });
  }
  for (const list of Object.values(weeksByTerm)) list.sort((a, b) => a.number - b.number);
  return { firstUnlockByTerm, weeksByTerm };
}
