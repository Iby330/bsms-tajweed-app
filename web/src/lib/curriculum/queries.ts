/**
 * The single server read behind every course screen. One round of queries
 * feeds the term index, the course index and the module list — the tree is
 * cheap to build and the tables are small (26 weeks, 28 homeworks).
 */

import { supabaseServer } from "@/lib/supabase/server";
import { getCachedTerms, getCachedWeeks } from "@/lib/reference/cached";
import {
  buildTree, overlayProgress,
  type Term, type SubStatus, type CurriculumRows, type ClassSchedule,
  type TermRow, type WeekRow, type LessonRow, type HomeworkRow,
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
 * `firstUnlockByTerm` is carried alongside the courses so the client-side
 * unlock arithmetic can match `class_item_unlock_at` in the database exactly.
 * Both derive a term's dates from its first week, so they cannot drift apart
 * as long as they read the same weeks.
 */
export async function getClassSchedule(
  classId: string | null | undefined,
): Promise<ClassSchedule | null> {
  if (!classId) return null;
  const db = await supabaseServer();
  const [{ data: rows }, weeks] = await Promise.all([
    db.from("class_courses")
      .select(`course_id, term_id, position, courses(key, label)`)
      .eq("class_id", classId)
      .order("term_id")
      .order("position"),
    getCachedWeeks(),
  ]);
  if (!rows?.length) return null;

  const firstUnlockByTerm: Record<number, string> = {};
  for (const w of weeks as WeekRow[]) {
    const at = firstUnlockByTerm[w.term_id];
    if (!at || Date.parse(w.unlock_at) < Date.parse(at)) firstUnlockByTerm[w.term_id] = w.unlock_at;
  }

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
      }];
    }),
    firstUnlockByTerm,
  };
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

  const [terms, weeks, lessons, homeworks, schedule] = await Promise.all([
    getCachedTerms(),
    getCachedWeeks(),
    db.from("lessons").select(LESSON_COLS).order("position"),
    db.from("homeworks").select(HOMEWORK_COLS).order("number"),
    getClassSchedule(classId),
  ]);

  return buildTree(
    {
      terms: terms as TermRow[],
      weeks: weeks as WeekRow[],
      lessons: (lessons.data ?? []) as LessonRow[],
      homeworks: (homeworks.data ?? []) as HomeworkRow[],
    },
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
    .from("profiles").select("class_id, unlock_all").eq("id", studentId).single();

  const [terms, weeks, lessons, homeworks, watches, subs, pcts, schedule] = await Promise.all([
    getCachedTerms(),
    getCachedWeeks(),
    db.from("lessons").select(LESSON_COLS).order("position"),
    db.from("homeworks").select(HOMEWORK_COLS).order("number"),
    db.from("lesson_watches").select("lesson_id").eq("student_id", studentId),
    db.from("submissions").select("homework_id, status").eq("student_id", studentId),
    db.from("v_hw_pct").select("homework_id, pct").eq("student_id", studentId),
    getClassSchedule(me?.class_id),
  ]);

  const rows: CurriculumRows = {
    terms: terms as TermRow[],
    weeks: weeks as WeekRow[],
    lessons: (lessons.data ?? []) as LessonRow[],
    homeworks: (homeworks.data ?? []) as HomeworkRow[],
  };

  const progress = {
    watchedLessonIds: new Set((watches.data ?? []).map((w) => w.lesson_id)),
    submissionByHomeworkId: new Map(
      (subs.data ?? []).map((s) => [s.homework_id, s.status as SubStatus]),
    ),
  };

  return {
    terms: overlayProgress(buildTree(rows, now, schedule, me?.unlock_all ?? false), progress),
    pctByHomeworkId: new Map(
      (pcts.data ?? []).map((r) => [r.homework_id as string, Number(r.pct)]),
    ),
    rows,
    ...progress,
  };
}
