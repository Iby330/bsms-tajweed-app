"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer, currentProfile } from "@/lib/supabase/server";

/** The exam is 80% of the grade — without this the progress views show nothing. */
export async function setExamScore(
  studentId: string,
  termId: number,
  score: number | null,
): Promise<void> {
  const profile = await currentProfile();
  if (!profile || profile.role !== "teacher") throw new Error("Teachers only.");
  const db = await supabaseServer();

  if (score === null || Number.isNaN(score)) {
    await db.from("exam_scores").delete().eq("student_id", studentId).eq("term_id", termId);
  } else {
    const { data: term } = await db.from("terms").select("exam_max").eq("id", termId).single();
    const max = Number(term?.exam_max ?? 100);
    const clamped = Math.max(0, Math.min(max, score));
    await db.from("exam_scores").upsert({
      student_id: studentId, term_id: termId, score: clamped, entered_by: profile.id,
    });
  }
  revalidatePath("/teacher/roster");
}
