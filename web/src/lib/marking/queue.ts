import { supabaseServer } from "@/lib/supabase/server";
import { teacherRoster } from "@/lib/teacher/scope";

export type QueueItem = {
  id: string;
  studentName: string;
  homeworkNumber: number | null;
  homeworkSeries: string | null;
  homeworkTitle: string;
  isLate: boolean;
};

/**
 * Scripts waiting on this teacher, oldest hand-in first: their own class's
 * submitted and auto-marked work, the same list as the home page's
 * "waiting to be marked".
 */
export async function reviewQueue(): Promise<QueueItem[]> {
  const roster = await teacherRoster();
  if (!roster.length) return [];
  const nameOf = new Map(roster.map((s) => [s.id, s.full_name]));
  const db = await supabaseServer();
  const { data } = await db
    .from("submissions")
    .select("id, is_late, student_id, homeworks(number, series, title)")
    .in("status", ["submitted", "auto_marked"])
    .in("student_id", roster.map((s) => s.id))
    .order("submitted_at");
  return (data ?? []).map((s) => ({
    id: s.id,
    studentName: nameOf.get(s.student_id) ?? "Student",
    homeworkNumber: s.homeworks?.number ?? null,
    homeworkSeries: s.homeworks?.series ?? null,
    homeworkTitle: s.homeworks?.title ?? "",
    isLate: s.is_late,
  }));
}
