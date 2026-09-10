import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { TERMS, termSessions, type TermId, type Timetable } from "@/lib/attendance/calendar";
import { COURSES, coursesForTerm, hasSyllabus } from "./syllabus";

/**
 * A class's syllabus, laid out across the Mondays it will actually be taught.
 *
 * Week N of a term takes the Nth lesson of every course that class is
 * studying, so group 1 — on ghunna and mudood together — gets two entries per
 * Monday and everyone else gets two of their own pair.
 *
 * ── What a student is allowed to see ─────────────────────────────────────
 *
 * Two different things, deliberately kept apart:
 *
 *   · The TOPIC — "Mudūd 3" — is always shown. It is the class's own
 *     curriculum, and knowing what you will be taught in week 6 is the point
 *     of publishing a calendar at all.
 *   · The lesson TITLE and the link are shown only once the lesson's week has
 *     unlocked. Titles are content, and `s_lessons_unlocked` exists to keep a
 *     locked week's contents out of a student's hands. Naming the topic does
 *     not breach that; naming "Madd Lāzim" three months early would.
 *
 * A link is offered only when following it will work AND there is something to
 * watch — the week is open and the lesson has a video. Everything else is
 * plain text, so the calendar never hands anyone a dead link.
 *
 * The read goes through the service-role client because a locked lesson is
 * invisible to the student who is about to be told they are studying it. It
 * must NOT be cached in lib/reference/cached.ts: the rows are unlock-gated,
 * and the result here is narrowed per class.
 */

export type PlannedLesson = {
  /** Always present: the course and its position, e.g. "Mudūd" + 3. */
  courseLabel: string;
  index: number;
  /** The real lesson title — only once its week is open. */
  title: string | null;
  /** Only when the lesson page will render and has a video to play. */
  href: string | null;
  /** True when the syllabus asks for a lesson the app does not hold. */
  missing: boolean;
};

export type PlannedWeek = {
  date: string;
  /** 1-based within its term. */
  number: number;
  lessons: PlannedLesson[];
};

export type LessonRow = {
  id: string;
  title: string;
  series: string;
  position: number;
  youtube_id: string | null;
  weeks: { term_id: number; number: number; unlock_at: string } | null;
};

/** Lessons of one course, in teaching order. */
function courseLessons(rows: LessonRow[], series: string, termId: TermId): LessonRow[] {
  return rows
    .filter((r) => r.series === series && r.weeks?.term_id === termId)
    .sort((a, b) => (a.weeks!.number - b.weeks!.number) || (a.position - b.position));
}

/**
 * Lay a class's syllabus out over its Mondays. Pure — the IO wrapper below
 * fetches the rows, this decides what each week holds.
 */
export function planFromLessons(
  rows: LessonRow[],
  className: string | null | undefined,
  timetable: Timetable,
  now: Date,
): Record<number, PlannedWeek[]> {
  if (!hasSyllabus(className)) return {};

  // One pass per course, not per week: the same course is asked for by up to
  // ten Mondays and the sort would otherwise be repeated for each.
  const byCourse = new Map<string, LessonRow[]>();
  const lessonsOf = (series: string, termId: TermId) => {
    const key = `${series} ${termId}`;
    let hit = byCourse.get(key);
    if (!hit) byCourse.set(key, (hit = courseLessons(rows, series, termId)));
    return hit;
  };

  const nowMs = now.getTime();
  const plans: Record<number, PlannedWeek[]> = {};

  for (const term of TERMS) {
    const courses = coursesForTerm(className, term.id);
    if (courses.length === 0) continue;

    // Tajweed days only. The Monday lesson is the taught one; hifdh is
    // recitation, and has no video series behind it.
    const mondays = termSessions(term.id, timetable, "tajweed");

    plans[term.id] = mondays.map((date, i) => ({
      date,
      number: i + 1,
      lessons: courses.map((key): PlannedLesson => {
        const course = COURSES[key];
        const lesson = course.source
          ? lessonsOf(course.source.series, course.source.termId)[i]
          : undefined;
        const open = !!lesson && Date.parse(lesson.weeks!.unlock_at) <= nowMs;
        return {
          courseLabel: course.label,
          index: i + 1,
          title: open ? lesson.title : null,
          href: open && lesson.youtube_id ? `/lessons/${lesson.id}` : null,
          missing: !lesson,
        };
      }),
    }));
  }

  return plans;
}

/**
 * The whole year's plan for one class, keyed by term. Empty for a class with
 * no syllabus — the sisters, until theirs is decided.
 */
export async function getTermPlans(
  className: string | null | undefined,
  timetable: Timetable,
  now: Date = new Date(),
): Promise<Record<number, PlannedWeek[]>> {
  if (!hasSyllabus(className)) return {};

  const { data } = await supabaseAdmin()
    .from("lessons")
    .select("id, title, series, position, youtube_id, weeks(term_id, number, unlock_at)");

  return planFromLessons((data ?? []) as LessonRow[], className, timetable, now);
}
