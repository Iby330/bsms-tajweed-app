/**
 * The single server read behind every course screen. One round of queries
 * feeds the term index, the course index and the module list — the tree is
 * cheap to build and the tables are small (26 weeks, 28 homeworks).
 */

import { supabaseServer } from "@/lib/supabase/server";
import { getCachedTerms, getCachedWeeks, getCachedSectionWeeks } from "@/lib/reference/cached";
import { rowsForSection, scheduleWeeks, weeksForSection, withExtensions } from "./section-weeks";
import {
  buildTree, overlayProgress,
  type Term, type SubStatus, type CurriculumRows, type ClassSchedule,
  type TermRow, type WeekRow, type LessonRow, type HomeworkRow, type RedoInfo,
} from "./tree";

/** Both content tables, with the course columns 0026 added. One template
 *  literal each: a select built by concatenation widens to `string` and kills
 *  postgrest-js type inference (LEARNINGS.md, 2026-08-12). */
const LESSON_COLS = `id, week_id, course_id, ordinal, series, title, youtube_id, position`;
const HOMEWORK_COLS =
  `id, week_id, course_id, ordinal, number, series, title, total_marks, due_at, is_graded`;

/**
 * A class's syllabus, or null when it has none.
 *
 * Null is the normal state for the sisters' four classes and the two demo
 * cohorts, and it means "show the whole programme as before" rather than
 * "show nothing" — see ClassSchedule in tree.ts.
 *
 * The term's weeks (number, unlock, due) and the class's own item weeks
 * (`class_course_items`) are carried alongside the courses, so the client-side
 * arithmetic can match `class_item_unlock_at` / `class_item_due_at` in the
 * database exactly (0044). They cannot drift apart as long as they read the
 * same rows. The weeks are the CLASS's section's (0052), as those functions
 * read them, so a sisters' class opens on its Wednesday.
 */
export async function getClassSchedule(
  classId: string | null | undefined,
): Promise<ClassSchedule | null> {
  if (!classId) return null;
  const db = await supabaseServer();
  const [{ data: rows }, { data: items }, section, weeks, sectionWeeks] = await Promise.all([
    db.from("class_courses")
      .select(`course_id, term_id, position, due_days_after_unlock, courses(key, label)`)
      .eq("class_id", classId)
      .order("term_id")
      .order("position"),
    db.from("class_course_items")
      .select("course_id, ordinal, week_number")
      .eq("class_id", classId),
    classSection(classId),
    getCachedWeeks(),
    getCachedSectionWeeks(),
  ]);
  if (!rows?.length) return null;

  const { firstUnlockByTerm, weeksByTerm } =
    scheduleWeeks(weeksForSection(weeks as WeekRow[], sectionWeeks, section));

  const itemWeeks: Record<string, Record<number, number>> = {};
  for (const i of items ?? []) (itemWeeks[i.course_id] ??= {})[i.ordinal] = i.week_number;

  return {
    courses: rows.flatMap((r) => {
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
    }),
    firstUnlockByTerm,
    weeksByTerm,
    itemWeeks,
  };
}

/** A class's section, whose week calendar its syllabus runs on. Null when the
 *  class is unreadable, which leaves it on the shared weeks. */
async function classSection(classId: string): Promise<string | null> {
  const db = await supabaseServer();
  const { data } = await db.from("classes").select("section").eq("id", classId).maybeSingle();
  return data?.section ?? null;
}

export type StudentCurriculum = {
  terms: Term[];
  /** homework_id → approved percentage. Only approved work appears. */
  pctByHomeworkId: Map<string, number>;
  /**
   * The flat rows the tree was built from — the calendar included.
   *
   * Home wants one week's lessons and homeworks, not a year-shaped tree, and
   * digging them back out of the tree means knowing which course they belong
   * to first. Handing the rows over costs nothing (they are already in memory)
   * and spares the caller four queries for rows this call has just read.
   */
  rows: CurriculumRows;
  watchedLessonIds: Set<string>;
  /** homework_id → the student's submission status, whatever stage it is at. */
  submissionByHomeworkId: Map<string, SubStatus>;
  /**
   * homework_id → the attempt the student is on, for work a teacher sent
   * back. Only second and later attempts are in here, so "is this homework a
   * redo?" is a lookup rather than a comparison every caller has to get right.
   */
  redoByHomeworkId: Map<string, RedoInfo>;
  /**
   * Whether the tree was built from this student's class syllabus.
   *
   * False for a class that has none, and false for a reader exempt from the
   * calendar, who is put back on the whole programme. The course index needs
   * it to read an unlisted course correctly: under a syllabus it belongs to
   * another class, without one it is simply this student's next term.
   */
  hasSyllabus: boolean;
  /**
   * The reader is exempt from the calendar (`profiles.unlock_all`).
   *
   * Exposed because a demo account has to be shown the app as a student in
   * term would see it, and before the year opens that is not what the clock
   * says. Home uses it to fall back to the first week rather than announcing
   * that the year has not started.
   */
  unlockAll: boolean;
};

/**
 * The same tree with no student on it — every week of the year, released or
 * not, as the teacher screens need it.
 *
 * No `overlayProgress`: watches and submissions belong to one student, and a
 * teacher is looking at a class. Nothing is filtered by unlock date either,
 * because RLS hands teachers the locked rows too — which is the whole point of
 * a curriculum screen, where preparing next term is the work.
 */
export async function getCurriculumTree(
  now: Date = new Date(),
  /** Scope the tree to one class's syllabus. Omit for the whole programme,
   *  which is what a teacher gets when no class is selected. */
  classId?: string | null,
): Promise<Term[]> {
  const db = await supabaseServer();

  const [terms, weeks, sectionWeeks, lessons, homeworks, schedule, section] = await Promise.all([
    getCachedTerms(),
    getCachedWeeks(),
    getCachedSectionWeeks(),
    db.from("lessons").select(LESSON_COLS).order("position"),
    db.from("homeworks").select(HOMEWORK_COLS).order("number"),
    getClassSchedule(classId),
    classId ? classSection(classId) : null,
  ]);

  // Scoped to a class, its section's calendar and each homework due when that
  // class's week says; unscoped, the shared weeks.
  return buildTree(
    rowsForSection(
      {
        terms: terms as TermRow[],
        weeks: weeks as WeekRow[],
        lessons: (lessons.data ?? []) as LessonRow[],
        homeworks: (homeworks.data ?? []) as HomeworkRow[],
      },
      sectionWeeks, section, schedule,
    ),
    now,
    schedule,
  );
}

export async function getStudentCurriculum(
  studentId: string,
  now: Date = new Date(),
): Promise<StudentCurriculum> {
  const db = await supabaseServer();

  // The student's own class, for their syllabus, and whether they are exempt
  // from the calendar altogether. Read here rather than threaded through five
  // call sites that all pass the current user anyway.
  const { data: me } = await db
    .from("profiles").select("class_id, unlock_all, section").eq("id", studentId).single();

  const [terms, weeks, sectionWeeks, lessons, homeworks, watches, subs, pcts, schedule, extensions, resources] = await Promise.all([
    getCachedTerms(),
    getCachedWeeks(),
    getCachedSectionWeeks(),
    db.from("lessons").select(LESSON_COLS).order("position"),
    db.from("homeworks").select(HOMEWORK_COLS).order("number"),
    db.from("lesson_watches").select("lesson_id").eq("student_id", studentId),
    db.from("submissions")
      .select("homework_id, status, attempt, previous_pct")
      .eq("student_id", studentId),
    db.from("v_hw_pct").select("homework_id, pct").eq("student_id", studentId),
    getClassSchedule(me?.class_id),
    db.from("homework_extensions").select("homework_id, due_at").eq("student_id", studentId),
    db.from("class_resources").select("course_id"),
  ]);

  // A Resources course's homework (0077) is open to the class but is nobody's
  // weekly work: no deadline, set in person. It lives on the Resources page,
  // so it is kept out of the year here — off Home's due and overdue lists and
  // out of every course page. A course the class also takes keeps its own.
  const planned = new Set((schedule?.courses ?? []).map((c) => c.courseId));
  const resourceOnly = new Set(
    (resources.data ?? []).map((r) => r.course_id).filter((id) => !planned.has(id)),
  );
  const homeworkRows = ((homeworks.data ?? []) as HomeworkRow[])
    .filter((h) => !h.course_id || !resourceOnly.has(h.course_id));

  const unlockAll = me?.unlock_all ?? false;
  // The same condition `buildTree` applies, so the two cannot disagree.
  const hasSyllabus = !unlockAll && (schedule?.courses.length ?? 0) > 0;

  // The reader's section's calendar (0052), and the deadlines on the flat rows
  // as well as the tree: Home reads both, and `homework_due_for` is what the
  // hand-in is stamped against — the class's week under a syllabus, the
  // reader's section's week without one.
  const rows: CurriculumRows = rowsForSection(
    {
      terms: terms as TermRow[],
      weeks: weeks as WeekRow[],
      lessons: (lessons.data ?? []) as LessonRow[],
      homeworks: homeworkRows,
    },
    sectionWeeks, me?.section, hasSyllabus ? schedule : null,
  );
  // Last, so a teacher's extension beats the class and section deadlines.
  rows.homeworks = withExtensions(rows.homeworks, extensions.data ?? []);

  const progress = {
    watchedLessonIds: new Set((watches.data ?? []).map((w) => w.lesson_id)),
    submissionByHomeworkId: new Map(
      (subs.data ?? []).map((s) => [s.homework_id, s.status as SubStatus]),
    ),
    // Only rows past the first attempt. A first attempt is the ordinary case
    // and carries no `previous_pct`, so putting it in the map would say
    // "this came back" about every homework in the year.
    redoByHomeworkId: new Map(
      (subs.data ?? [])
        .filter((s) => s.attempt > 1)
        .map((s) => [
          s.homework_id,
          { attempt: s.attempt, previousPct: s.previous_pct } satisfies RedoInfo,
        ]),
    ),
  };

  return {
    terms: overlayProgress(buildTree(rows, now, schedule, unlockAll), progress),
    hasSyllabus,
    unlockAll,
    pctByHomeworkId: new Map(
      (pcts.data ?? []).map((r) => [r.homework_id as string, Number(r.pct)]),
    ),
    rows,
    ...progress,
  };
}
