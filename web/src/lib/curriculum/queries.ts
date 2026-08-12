/**
 * The single server read behind every course screen. One round of queries
 * feeds the term index, the course index and the module list — the tree is
 * cheap to build and the tables are small (26 weeks, 28 homeworks).
 */

import { supabaseServer } from "@/lib/supabase/server";
import { getCachedTerms, getCachedWeeks } from "@/lib/reference/cached";
import {
  buildTree, overlayProgress,
  type Term, type SubStatus,
  type TermRow, type WeekRow, type LessonRow, type HomeworkRow,
} from "./tree";

export type StudentCurriculum = {
  terms: Term[];
  /** homework_id → approved percentage. Only approved work appears. */
  pctByHomeworkId: Map<string, number>;
};

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

  const tree = buildTree(
    {
      terms: terms as TermRow[],
      weeks: weeks as WeekRow[],
      lessons: (lessons.data ?? []) as LessonRow[],
      homeworks: (homeworks.data ?? []) as HomeworkRow[],
    },
    now,
  );

  return {
    terms: overlayProgress(tree, {
      watchedLessonIds: new Set((watches.data ?? []).map((w) => w.lesson_id)),
      submissionByHomeworkId: new Map(
        (subs.data ?? []).map((s) => [s.homework_id, s.status as SubStatus]),
      ),
    }),
    pctByHomeworkId: new Map(
      (pcts.data ?? []).map((r) => [r.homework_id as string, Number(r.pct)]),
    ),
  };
}
