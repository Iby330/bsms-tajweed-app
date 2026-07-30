"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer, currentProfile } from "@/lib/supabase/server";

async function requireTeacher() {
  const profile = await currentProfile();
  if (!profile || profile.role !== "teacher") throw new Error("Teachers only.");
  return profile;
}

/** Recited correctly to the teacher. The comment is visible to the student —
 *  it replaces the mistakes they used to mark in their physical Qur'an. */
export async function markSurahPassed(
  studentId: string,
  surahNumber: number,
  comment?: string,
): Promise<void> {
  const teacher = await requireTeacher();
  const db = await supabaseServer();
  await db.from("hifz_records").upsert(
    {
      student_id: studentId,
      surah_number: surahNumber,
      teacher_comment: comment?.trim() || null,
      marked_by: teacher.id,
    },
    { onConflict: "student_id,surah_number" },
  );
  revalidatePath("/teacher/hifz");
  revalidatePath("/hifz");
}

export async function unmarkSurah(studentId: string, surahNumber: number): Promise<void> {
  await requireTeacher();
  const db = await supabaseServer();
  await db.from("hifz_records").delete()
    .eq("student_id", studentId).eq("surah_number", surahNumber);
  revalidatePath("/teacher/hifz");
  revalidatePath("/hifz");
}

/** Per-student override — a returning student who passed a hifz check
 *  resumes from where they finished rather than restarting at An-Nas. */
export async function setStudentHifzProfile(
  studentId: string,
  startSurah: number,
  targetCount: number,
): Promise<void> {
  await requireTeacher();
  const db = await supabaseServer();
  await db.from("hifz_profiles").upsert({
    student_id: studentId, start_surah: startSurah, target_count: targetCount,
  });
  revalidatePath("/teacher/hifz");
  revalidatePath("/hifz");
}

/** The default: one target for the whole class, at the teacher's discretion. */
export async function setClassTarget(classId: string, targetCount: number): Promise<void> {
  await requireTeacher();
  const db = await supabaseServer();
  const { data: students } = await db
    .from("profiles").select("id").eq("class_id", classId).eq("role", "student");
  for (const s of students ?? []) {
    await db.from("hifz_profiles").upsert({
      student_id: s.id, start_surah: 114, target_count: targetCount,
    });
  }
  revalidatePath("/teacher/hifz");
}
