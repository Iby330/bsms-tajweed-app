import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { TERMS, termSessions, type TermId, type Timetable } from "@/lib/attendance/calendar";
import { ruleName } from "@/lib/lessons/rule-name";
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
 * The RULE is always named — "Madd Lāzim", not "Mudūd 3". A slot number tells
 * a student which week they are in but not what they will be taught, which is
 * the question a calendar is actually being asked. A syllabus is not secret,
 * and this is the class's own.
 *
 * (An earlier pass here withheld the rule until the week unlocked, on the
 * grounds that a title is content. That was the wrong line: it left students
 * reading "Mudūd 3" for a term. The gate that matters is the LINK.)
 *
 * A link is offered only when following it will work AND there is something
 * to watch. What "will work" means depends on who is reading, so the plan is
 * built per audience:
 *
 *   · A STUDENT goes to /lessons/<id>, which 404s a week that has not opened
 *     yet — so their link waits for the unlock.
 *   · A TEACHER goes to /teacher/lessons/<id>, which deliberately locks
 *     nothing, because preparing an unopened week is the job. Their link only
 *     waits for the video.
 *
 * Getting this wrong is not a dead link but a worse one: the student layout
 * redirects any teacher who lands on /lessons/<id> to /teacher/home, so a
 * teacher clicking a lesson would be bounced to their own homepage with no
 * explanation.
 *
 * The read goes through the service-role client because a locked lesson is
 * invisible to the student who is about to be told they are studying it. It
 * must NOT be cached in lib/reference/cached.ts: the rows are unlock-gated,
 * and the result here is narrowed per class.
 */

export type PlannedLesson = {
  /** The course this belongs to, e.g. "Mudūd", and its position in it. */
  courseLabel: string;
  index: number;
  /**
   * What is taught: the rule the lesson names — "Madd Lāzim" — falling back
   * to the course and its number when the stored title carries no rule (the
   * Ten Fundamental Principles are filed as "HW 1"…"HW 7") or when the app
   * holds no lesson for that slot at all.
   */
  label: string;
  /** Only when the lesson page will render and has a video to play. */
  href: string | null;
  /** True when the syllabus asks for a lesson the app does not hold. */
  missing: boolean;
};

export type PlanAudience = "student" | "teacher";

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
  audience: PlanAudience = "student",
): Record<number, PlannedWeek[]> {
  if (!hasSyllabus(className)) return {};

  const base = audience === "teacher" ? "/teacher/lessons" : "/lessons";

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
        const reachable = audience === "teacher" ? !!lesson : open;
        const rule = lesson ? ruleName(lesson.title) : null;
        return {
          courseLabel: course.label,
          index: i + 1,
          label: rule ?? `${course.label} ${i + 1}`,
          href: reachable && lesson?.youtube_id ? `${base}/${lesson.id}` : null,
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
  { now = new Date(), audience = "student" }: { now?: Date; audience?: PlanAudience } = {},
): Promise<Record<number, PlannedWeek[]>> {
  if (!hasSyllabus(className)) return {};

  const { data } = await supabaseAdmin()
    .from("lessons")
    .select("id, title, series, position, youtube_id, weeks(term_id, number, unlock_at)");

  return planFromLessons((data ?? []) as LessonRow[], className, timetable, now, audience);
}
