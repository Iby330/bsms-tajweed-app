/**
 * The single server read behind every course screen. One round of queries
 * feeds the term index, the course index and the module list — the tree is
 * cheap to build and the tables are small (26 weeks, 28 homeworks).
 */

import { supabaseServer } from "@/lib/supabase/server";
import { getCachedTerms, getCachedWeeks } from "@/lib/reference/cached";
import {
  buildTree, overlayProgress,
  type Term, type SubStatus, type CurriculumRows,
  type TermRow, type WeekRow, type LessonRow, type HomeworkRow,
} from "./tree";

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
export async function getCurriculumTree(now: Date = new Date()): Promise<Term[]> {
  const db = await supabaseServer();

  const [terms, weeks, lessons, homeworks] = await Promise.all([
    getCachedTerms(),
    getCachedWeeks(),
    db.from("lessons").select("id, week_id, series, title, youtube_id, position").order("position"),
    db.from("homeworks").select("id, week_id, number, series, title, total_marks, due_at, is_graded").order("number"),
  ]);

  return buildTree(
    {
      terms: terms as TermRow[],
      weeks: weeks as WeekRow[],
      lessons: (lessons.data ?? []) as LessonRow[],
      homeworks: (homeworks.data ?? []) as HomeworkRow[],
    },
    now,
  );
}

export async function getStudentCurriculum(
  studentId: string,
  now: Date = new Date(),
): Promise<StudentCurriculum> {
  const db = await supabaseServer();

  const [terms, weeks, lessons, homeworks, watches, subs, pcts] = await Promise.all([
    getCachedTerms(),
    getCachedWeeks(),
    db.from("lessons").select("id, week_id, series, title, youtube_id, position").order("position"),
    db.from("homeworks").select("id, week_id, number, series, title, total_marks, due_at, is_graded").order("number"),
    db.from("lesson_watches").select("lesson_id").eq("student_id", studentId),
    db.from("submissions").select("homework_id, status").eq("student_id", studentId),
    db.from("v_hw_pct").select("homework_id, pct").eq("student_id", studentId),
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
    terms: overlayProgress(buildTree(rows, now), progress),
    pctByHomeworkId: new Map(
      (pcts.data ?? []).map((r) => [r.homework_id as string, Number(r.pct)]),
    ),
    rows,
    ...progress,
  };
}
