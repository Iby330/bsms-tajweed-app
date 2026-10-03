import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { TERMS, termSessions, type TermId, type Timetable } from "@/lib/attendance/calendar";
import { ruleName } from "@/lib/lessons/rule-name";
import { COURSES, coursesForTerm, hasSyllabus } from "./syllabus";
import { classItemWeek, scheduledUnlockAt, type ClassSchedule } from "./tree";
import { getClassSchedule } from "./queries";
import { sectionWeekRows, type SectionWeekRow } from "./section-weeks";
import { getCachedSectionWeeks } from "@/lib/reference/cached";

/**
 * A class's syllabus, laid out across the Mondays it will actually be taught.
 *
 * Week N of a term takes the items the class meets in week N: item N of each
 * course it studies, unless its schedule (`class_course_items`, 0044) puts an
 * item somewhere else. Group 1 meets several Ghunna, Mudūd and Ṣifāt items a
 * week, so one Monday can carry two items of one course and the next none.
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
 *     yet — so their link waits for the unlock, the CLASS's unlock where it
 *     has a schedule, which is the date RLS releases the row on.
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
  /** `id` only to look the week up in the section's calendar. */
  weeks: { id?: string; term_id: number; number: number; unlock_at: string } | null;
};

/**
 * Each lesson's week opening when `section`'s calendar says (0052), as
 * `can_see_content` releases it to that section. Only the no-schedule
 * fallback reads it; a class schedule carries its section's weeks already.
 */
export function lessonsOnSection(
  rows: LessonRow[], sectionWeeks: SectionWeekRow[], section: string | null | undefined,
): LessonRow[] {
  const mine = sectionWeekRows(sectionWeeks, section);
  if (mine.size === 0) return rows;
  return rows.map((r) => {
    const sw = r.weeks?.id ? mine.get(r.weeks.id) : undefined;
    return sw ? { ...r, weeks: { ...r.weeks!, unlock_at: sw.unlock_at } } : r;
  });
}

/** Lessons of one course, in teaching order. */
function courseLessons(rows: LessonRow[], series: string, termId: TermId): LessonRow[] {
  return rows
    .filter((r) => r.series === series && r.weeks?.term_id === termId)
    .sort((a, b) => (a.weeks!.number - b.weeks!.number) || (a.position - b.position));
}

/**
 * The items of one course a class meets in `week`, ascending.
 *
 * With nothing listed it is item `week` alone, as it always was — even past
 * the course's end, where the plan names a lesson the app does not hold. With
 * items listed, those items are wherever their list says, and an unlisted one
 * that exists keeps item k = week k: `class_item_week`'s rule.
 */
export function itemsInWeek(
  listed: Record<number, number> | undefined, count: number, week: number,
): number[] {
  if (!listed || Object.keys(listed).length === 0) return [week];
  const out = Object.entries(listed)
    .filter(([, w]) => w === week)
    .map(([k]) => Number(k));
  if (!(week in listed) && week <= count) out.push(week);
  return out.sort((a, b) => a - b);
}

/**
 * Lay a class's syllabus out over its Mondays. Pure — the IO wrapper below
 * fetches the rows, this decides what each week holds.
 *
 * `schedule` is the class's own (from `class_courses`): it says which week the
 * class meets each item in and when it opens. Without one, item k sits in week
 * k and opens with the week its row is filed under.
 */
export function planFromLessons(
  rows: LessonRow[],
  className: string | null | undefined,
  timetable: Timetable,
  now: Date,
  audience: PlanAudience = "student",
  schedule: ClassSchedule | null = null,
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
      lessons: courses.flatMap((key) => {
        const course = COURSES[key];
        const all = course.source ? lessonsOf(course.source.series, course.source.termId) : [];
        const sc = schedule?.courses.find((c) => c.key === key);
        const listed = sc ? schedule!.itemWeeks?.[sc.courseId] : undefined;
        return itemsInWeek(listed, all.length, i + 1).map((k): PlannedLesson => {
          const lesson = all[k - 1];
          const opensAt = lesson
            ? (sc ? scheduledUnlockAt(schedule!, sc.termId, k, sc.courseId) : null)
              ?? lesson.weeks!.unlock_at
            : null;
          const open = opensAt !== null && Date.parse(opensAt) <= nowMs;
          const reachable = audience === "teacher" ? !!lesson : open;
          const rule = lesson ? ruleName(lesson.title) : null;
          return {
            courseLabel: course.label,
            index: k,
            label: rule ?? `${course.label} ${k}`,
            href: reachable && lesson?.youtube_id ? `${base}/${lesson.id}` : null,
            missing: !lesson,
          };
        });
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
  {
    now = new Date(), audience = "student", classId = null, section = null,
  }: {
    now?: Date; audience?: PlanAudience; classId?: string | null;
    /** Whose week calendar the unscheduled fallback opens on: the reader's
     *  for a student (as RLS gates them), the class's for a teacher. */
    section?: string | null;
  } = {},
): Promise<Record<number, PlannedWeek[]>> {
  if (!hasSyllabus(className)) return {};

  const [{ data }, schedule, sectionWeeks] = await Promise.all([
    supabaseAdmin()
      .from("lessons")
      .select("id, title, series, position, youtube_id, weeks(id, term_id, number, unlock_at)"),
    // the class's own weeks and dates, read as the viewer, as the tree reads them
    getClassSchedule(classId),
    getCachedSectionWeeks(),
  ]);

  return planFromLessons(
    lessonsOnSection((data ?? []) as LessonRow[], sectionWeeks, section),
    className, timetable, now, audience, schedule,
  );
}
