"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer, currentProfile } from "@/lib/supabase/server";

export type StrikeReason = "absence" | "homework" | "conduct";

async function requireTeacher() {
  const profile = await currentProfile();
  if (!profile || profile.role !== "teacher") throw new Error("Teachers only.");
  return profile;
}

/**
 * Strikes are always a teacher's decision — nothing in the app issues one
 * automatically. Three in a term means leaving the course, so the note matters:
 * it's the record of why, months later, when someone asks.
 */
export async function issueStrike(
  studentId: string,
  termId: number,
  reason: StrikeReason,
  note?: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const teacher = await requireTeacher();
  const db = await supabaseServer();

  const { data, error } = await db
    .from("strikes")
    .insert({
      student_id: studentId,
      term_id: termId,
      reason,
      note: note?.trim() || null,
      issued_by: teacher.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/teacher/roster");
  revalidatePath("/teacher/attendance");
  revalidatePath("/home");
  return { ok: true, id: data.id };
}

/** Undo. Strikes get issued in the moment and sometimes need taking back. */
export async function removeStrike(
  strikeId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireTeacher();
  const db = await supabaseServer();

  // Detach from any attendance row first — the FK would block the delete.
  await db.from("attendance").update({ strike_id: null }).eq("strike_id", strikeId);

  const { error } = await db.from("strikes").delete().eq("id", strikeId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/teacher/roster");
  revalidatePath("/teacher/attendance");
  revalidatePath("/home");
  return { ok: true };
}

/** Every strike a student has this term, newest last. */
export async function listStrikes(studentId: string, termId: number) {
  await requireTeacher();
  const db = await supabaseServer();
  const { data } = await db
    .from("strikes")
    .select("id, reason, note, issued_at")
    .eq("student_id", studentId)
    .eq("term_id", termId)
    .order("issued_at");
  return data ?? [];
}
