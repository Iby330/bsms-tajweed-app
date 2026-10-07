"use server";

import { refresh, revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentProfile } from "@/lib/supabase/server";
import { teacherClasses } from "@/lib/teacher/scope";

/**
 * Give one student more time on one homework, or take it back (0067).
 *
 * `dueAt` is an ISO instant, already converted from the teacher's own clock
 * in the browser; null withdraws the extension and the student is back on
 * their class's deadline. Work already handed in keeps the late mark it was
 * stamped with: an extension moves the deadline for what is still to come,
 * and the "remove" on the late tag is there for the rest.
 */
export async function setExtension(
  homeworkId: string,
  studentId: string,
  dueAt: string | null,
): Promise<{ error: string | null }> {
  const teacher = await currentProfile();
  if (!teacher || teacher.role !== "teacher") return { error: "Only teachers can do that." };

  const db = supabaseAdmin();
  const [allowed, { data: student }] = await Promise.all([
    teacherClasses(),
    db.from("profiles").select("class_id").eq("id", studentId).maybeSingle(),
  ]);
  if (!student) return { error: "That student could not be found." };
  if (allowed.length && !allowed.some((c) => c.id === student.class_id)) {
    return { error: "This student is not in a class you teach." };
  }

  if (dueAt === null) {
    const { error } = await db
      .from("homework_extensions").delete()
      .eq("homework_id", homeworkId).eq("student_id", studentId);
    if (error) return { error: error.message };
  } else {
    if (Number.isNaN(Date.parse(dueAt))) return { error: "That is not a date." };
    const { error } = await db.from("homework_extensions").upsert(
      {
        homework_id: homeworkId,
        student_id: studentId,
        due_at: new Date(dueAt).toISOString(),
        granted_by: teacher.id,
        granted_at: new Date().toISOString(),
      },
      { onConflict: "homework_id,student_id" },
    );
    if (error) return { error: error.message };
  }

  revalidatePath("/teacher/homework");
  revalidatePath("/home");
  revalidatePath("/homework");
  revalidatePath("/courses");
  refresh();
  return { error: null };
}
