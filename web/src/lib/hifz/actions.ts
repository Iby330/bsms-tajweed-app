"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer, currentProfile } from "@/lib/supabase/server";
import { getCachedSurahs } from "@/lib/reference/cached";
import { teacherClass, teacherRoster } from "@/lib/teacher/scope";
import { memorisationList, type Surah } from "@/lib/hifz/pace";

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

/** The target must land between the start surah and the end of the run, or
 *  the register renders a target no student can reach. Returns the student's
 *  own run so callers share one definition of "fits". */
async function requireValidTarget(startSurah: number, targetCount: number): Promise<void> {
  const surahs = (await getCachedSurahs()) as Surah[];
  const run = memorisationList(startSurah, surahs.length, surahs);
  // memorisationList falls back to the top of the list for an unknown start —
  // here that silent recovery would store a profile the teacher didn't set.
  if (run[0]?.number !== startSurah) throw new Error("Unknown start surah.");
  if (!Number.isInteger(targetCount) || targetCount < 1 || targetCount > run.length)
    throw new Error("Target must fit between the start surah and the end of the run.");
}

/** Per-student override — a returning student who passed a hifz check
 *  resumes from where they finished rather than restarting at An-Nas.
 *  Marks the profile custom, which exempts it from setClassTarget forever
 *  after (until the teacher sets it again). */
export async function setStudentHifzProfile(
  studentId: string,
  startSurah: number,
  targetCount: number,
): Promise<void> {
  await requireTeacher();
  const roster = await teacherRoster();
  if (!roster.some((s) => s.id === studentId)) throw new Error("Not your student.");
  await requireValidTarget(startSurah, targetCount);

  const db = await supabaseServer();
  await db.from("hifz_profiles").upsert({
    student_id: studentId, start_surah: startSurah, target_count: targetCount,
    is_custom: true,
  });
  revalidatePath("/teacher/hifz");
  revalidatePath("/hifz");
}

/**
 * The default: one target for the teacher's own class. Only ever writes
 * non-custom profiles, so a returning student's hand-set start and target
 * survive any number of re-applies. Always starts at An-Nas — a student who
 * starts anywhere else is by definition the per-student case.
 */
export async function setClassTarget(targetCount: number): Promise<void> {
  await requireTeacher();
  const cls = await teacherClass();
  // Without this, a class-less programme lead's roster is EVERY student in
  // the school — an "apply" would set the whole programme's targets at once.
  if (!cls) throw new Error("No class assigned.");
  await requireValidTarget(114, targetCount);

  const roster = await teacherRoster();
  if (!roster.length) return;

  const db = await supabaseServer();
  const { data: custom } = await db
    .from("hifz_profiles").select("student_id")
    .in("student_id", roster.map((s) => s.id)).eq("is_custom", true);
  const keep = new Set((custom ?? []).map((r) => r.student_id));

  const rows = roster
    .filter((s) => !keep.has(s.id))
    .map((s) => ({
      student_id: s.id, start_surah: 114, target_count: targetCount, is_custom: false,
    }));
  if (rows.length) {
    const { error } = await db.from("hifz_profiles").upsert(rows);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/teacher/hifz");
  revalidatePath("/hifz");
}
