"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { requireOwnStudent, requireTeacher } from "@/lib/teacher/guards";
import type { HearingOutcome } from "./hearings";

/**
 * The open hearing draft for this student and surah — reused if there is
 * one, inserted if not. Called on the FIRST TAP or the first verdict, never
 * on opening the page, so a teacher who opens a surah to look and leaves
 * creates no row. RLS (t_sessions_insert) guards the insert.
 */
export async function startHearing(studentId: string, surah: number): Promise<string> {
  const me = await requireTeacher();
  await requireOwnStudent(studentId);
  const db = await supabaseServer();

  const { data: existing } = await db
    .from("revision_sessions")
    .select("id")
    .eq("reviewer_id", me.id)
    .eq("reciter_id", studentId)
    .eq("kind", "hearing")
    .eq("surah_number", surah)
    .is("submitted_at", null)
    .maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await db
    .from("revision_sessions")
    .insert({ reviewer_id: me.id, reciter_id: studentId, kind: "hearing", surah_number: surah })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

const OUTCOMES: readonly string[] = ["passed", "not_passed"];

/**
 * The verdict. Passed writes the record FIRST: if that write fails the
 * hearing stays open, rather than a submitted hearing with no pass behind
 * it. The note is written to both the hearing and the record's
 * teacher_comment so everything that reads comments today keeps working.
 * The upsert leaves passed_at alone on a re-hearing — the date a surah was
 * first heard is never reset.
 */
export async function submitHearing(
  sessionId: string,
  outcome: HearingOutcome,
  note?: string,
): Promise<void> {
  const me = await requireTeacher();
  if (!OUTCOMES.includes(outcome)) throw new Error("Unknown outcome.");
  const db = await supabaseServer();

  const { data: s } = await db
    .from("revision_sessions")
    .select("id, reciter_id, surah_number")
    .eq("id", sessionId)
    .eq("reviewer_id", me.id)
    .eq("kind", "hearing")
    .is("submitted_at", null)
    .maybeSingle();
  if (!s || s.surah_number === null) throw new Error("Hearing already submitted or not yours.");
  await requireOwnStudent(s.reciter_id);
  const trimmed = note?.trim() || null;

  if (outcome === "passed") {
    const { error } = await db.from("hifz_records").upsert(
      {
        student_id: s.reciter_id,
        surah_number: s.surah_number,
        teacher_comment: trimmed,
        marked_by: me.id,
        session_id: s.id,
      },
      { onConflict: "student_id,surah_number" },
    );
    if (error) throw new Error(error.message);
  }

  const { error } = await db
    .from("revision_sessions")
    .update({ submitted_at: new Date().toISOString(), outcome, overall_note: trimmed })
    .eq("id", s.id)
    .is("submitted_at", null);
  if (error) throw new Error(error.message);

  revalidatePath("/hifz");
  revalidatePath(`/hifz/${s.surah_number}`);
  revalidatePath("/teacher/hifz");
  revalidatePath(`/teacher/hifz/${s.reciter_id}`);
  revalidatePath(`/teacher/hifz/${s.reciter_id}/${s.surah_number}`);
}
