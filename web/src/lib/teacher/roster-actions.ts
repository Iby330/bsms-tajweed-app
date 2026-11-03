"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { requireOwnStudent, requireTeacher } from "./guards";
import { planRemoval, type ClassRef, type RemovalChoice } from "./roster-removal";

export type RemovalResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Take a student off the caller's roster: moved to another class, or leaving
 * the programme. What each one writes is decided in roster-removal.ts; this
 * reads the rows it needs, checks the caller may touch this student, and
 * writes the plan.
 *
 * WHO: a teacher for their own class, an admin for any class. requireOwnStudent
 * is the check, not the button being hidden: it is what the action itself
 * would otherwise let any teacher do, since RLS grants teachers the cohort.
 *
 * ORDER: the application first, then the profile. If the profile write fails
 * the application already says where they should be, and the error is shown;
 * trying again writes the same values, so a retry is the fix. The board's
 * syncAccounts reads the application, so it agrees with this either way.
 */
export async function removeFromClass(
  studentId: string, choice: RemovalChoice,
): Promise<RemovalResult> {
  let me;
  try {
    me = await requireTeacher();
    await requireOwnStudent(studentId);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Not allowed." };
  }

  const db = await supabaseServer();
  const { data: student } = await db
    .from("profiles")
    .select("id, full_name, section, class_id, role")
    .eq("id", studentId)
    .maybeSingle();
  if (!student || student.role !== "student") return { ok: false, error: "Student not found." };

  const classIds = [student.class_id, choice.kind === "move" ? choice.classId : null]
    .filter((x): x is string => Boolean(x));
  const { data: classes } = classIds.length
    ? await db.from("classes").select("id, name, section").in("id", classIds)
    : { data: [] as ClassRef[] };
  const byId = new Map((classes ?? []).map((c) => [c.id, c as ClassRef]));

  const result = planRemoval({
    student: { ...student, section: String(student.section) },
    current: student.class_id ? byId.get(student.class_id) ?? null : null,
    target: choice.kind === "move" ? byId.get(choice.classId) ?? null : null,
    choice,
  });
  if (!result.ok) return result;
  const { plan } = result;

  // A student from before the board has no application; the profile change
  // is then the whole of it.
  const { data: apps, error: appErr } = await db
    .from("applications")
    .update({ ...plan.application, reviewed_by: me.id, reviewed_at: new Date().toISOString() })
    .eq("profile_id", studentId)
    .select("id");
  if (appErr) return { ok: false, error: appErr.message };

  const { error: profErr } = await db.from("profiles").update(plan.profile).eq("id", studentId);
  if (profErr) return { ok: false, error: profErr.message };

  // The why, on the applicant's thread, signed by whoever did it. A failed
  // note is not worth failing the move over: the change itself is stamped
  // with reviewed_by above.
  if (apps?.length) {
    await db.from("application_notes").insert(
      apps.map((a) => ({ application_id: a.id, author_id: me.id, body: plan.note })),
    );
  }

  revalidatePath("/teacher/roster");
  revalidatePath("/teacher/classes");
  revalidatePath("/teacher/attendance");
  revalidatePath("/teacher/applications");
  return { ok: true, message: plan.message };
}
