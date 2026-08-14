"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer, currentProfile } from "@/lib/supabase/server";
import { getCachedSurahs } from "@/lib/reference/cached";
import { teacherRoster } from "@/lib/teacher/scope";
import { memorisationList, type Surah } from "@/lib/hifz/pace";
import { planTargets } from "@/lib/hifz/targets";

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

/** Per-student start + target — a returning student who passed a hifz check
 *  resumes from where they finished rather than restarting at An-Nas. */
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
  const { error } = await db.from("hifz_profiles").upsert({
    student_id: studentId, start_surah: startSurah, target_count: targetCount,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/teacher/hifz");
  revalidatePath("/hifz");
}

/**
 * One end surah for a selection of students, a count per student — each
 * derived from that student's own start, so a returning student gets a
 * shorter run to the same goal. Students already past the end are skipped
 * (their names come back for the register to report), never reset backwards.
 * The explicit selection is the authority on who gets written; there is no
 * ambient "class default" any more.
 */
export async function setTargetForStudents(
  studentIds: string[],
  endSurah: number,
): Promise<{ applied: number; skipped: string[] }> {
  await requireTeacher();
  if (!studentIds.length) return { applied: 0, skipped: [] };

  const roster = await teacherRoster();
  const nameOf = new Map(roster.map((s) => [s.id, s.full_name]));
  if (!studentIds.every((id) => nameOf.has(id))) throw new Error("Not your students.");

  const surahs = (await getCachedSurahs()) as Surah[];
  if (!surahs.some((s) => s.number === endSurah)) throw new Error("Unknown end surah.");

  const db = await supabaseServer();
  const { data: profiles } = await db
    .from("hifz_profiles").select("student_id, start_surah").in("student_id", studentIds);
  const startOf = new Map((profiles ?? []).map((p) => [p.student_id, p.start_surah]));

  const { plans, skipped } = planTargets(
    studentIds.map((id) => ({ studentId: id, startSurah: startOf.get(id) ?? 114 })),
    endSurah,
    surahs,
  );

  if (plans.length) {
    const { error } = await db.from("hifz_profiles").upsert(
      plans.map((p) => ({
        student_id: p.studentId, start_surah: p.startSurah, target_count: p.count,
      })),
    );
    if (error) throw new Error(error.message);
  }
  revalidatePath("/teacher/hifz");
  revalidatePath("/hifz");
  return { applied: plans.length, skipped: skipped.map((id) => nameOf.get(id) ?? id) };
}
