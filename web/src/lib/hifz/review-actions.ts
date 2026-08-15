"use server";

import { revalidatePath } from "next/cache";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { teacherRoster } from "@/lib/teacher/scope";
import { CATEGORY_IDS, SESSION_FLAGS, type Category } from "./mistake-taxonomy";

async function requireTeacher() {
  const profile = await currentProfile();
  if (!profile || profile.role !== "teacher") throw new Error("Teachers only.");
  return profile;
}

async function requireUser() {
  const profile = await currentProfile();
  if (!profile) throw new Error("Sign in first.");
  return profile;
}

/** Pair two roster students, retiring any active pair either is already in —
 *  one active pair per student. Stored ordered (a < b) for the unique indexes. */
export async function assignPair(studentA: string, studentB: string): Promise<void> {
  const teacher = await requireTeacher();
  if (studentA === studentB) throw new Error("A pair needs two different students.");
  const roster = await teacherRoster();
  const ids = new Set(roster.map((s) => s.id));
  if (!ids.has(studentA) || !ids.has(studentB)) throw new Error("Not your students.");

  const db = await supabaseServer();
  const { error: retireErr } = await db
    .from("revision_pairs")
    .update({ active: false })
    .eq("active", true)
    .or(`student_a.in.(${studentA},${studentB}),student_b.in.(${studentA},${studentB})`);
  if (retireErr) throw new Error(retireErr.message);

  const [a, b] = [studentA, studentB].sort();
  const { error } = await db
    .from("revision_pairs")
    .insert({ student_a: a, student_b: b, assigned_by: teacher.id });
  if (error) throw new Error(error.message);
  revalidatePath("/teacher/hifz");
  revalidatePath("/hifz");
}

export async function unassignPair(pairId: string): Promise<void> {
  await requireTeacher();
  const db = await supabaseServer();
  const { error } = await db.from("revision_pairs").update({ active: false }).eq("id", pairId);
  if (error) throw new Error(error.message);
  revalidatePath("/teacher/hifz");
  revalidatePath("/hifz");
}

/** Open (or resume) a draft session reviewing `reciterId`. RLS re-checks the
 *  active pair on insert; the pre-check exists for a readable error. */
export async function startSession(reciterId: string): Promise<string> {
  const me = await requireUser();
  const db = await supabaseServer();

  const { data: existing } = await db
    .from("revision_sessions").select("id")
    .eq("reviewer_id", me.id).eq("reciter_id", reciterId)
    .is("submitted_at", null).maybeSingle();
  if (existing) return existing.id;

  const { data: pair } = await db
    .from("revision_pairs").select("id").eq("active", true)
    .or(`and(student_a.eq.${me.id},student_b.eq.${reciterId}),and(student_a.eq.${reciterId},student_b.eq.${me.id})`)
    .maybeSingle();
  if (!pair) throw new Error("You're not paired with this student.");

  const { data, error } = await db
    .from("revision_sessions")
    .insert({ reviewer_id: me.id, reciter_id: reciterId })
    .select("id").single();
  if (error) throw new Error(error.message);
  revalidatePath("/hifz");
  return data.id;
}

export type MistakeLocation = { surah: number; ayah: number; position: number };

/** One mistake per word per session: logging replaces any earlier
 *  classification of the same word. RLS (reviewer + draft) guards both
 *  statements. Returns the new row id so the client can undo it. */
export async function logMistake(
  sessionId: string,
  loc: MistakeLocation,
  category: Category,
  detail?: string,
  note?: string,
): Promise<string> {
  await requireUser();
  if (!CATEGORY_IDS.includes(category)) throw new Error("Unknown category.");
  const db = await supabaseServer();

  const { error: delErr } = await db
    .from("revision_mistakes").delete()
    .eq("session_id", sessionId)
    .eq("surah_number", loc.surah).eq("ayah_number", loc.ayah).eq("word_position", loc.position);
  if (delErr) throw new Error(delErr.message);

  const { data, error } = await db
    .from("revision_mistakes")
    .insert({
      session_id: sessionId,
      surah_number: loc.surah, ayah_number: loc.ayah, word_position: loc.position,
      category, detail: detail || null, note: note?.trim() || null,
    })
    .select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function removeMistake(mistakeId: string): Promise<void> {
  await requireUser();
  const db = await supabaseServer();
  const { error } = await db.from("revision_mistakes").delete().eq("id", mistakeId);
  if (error) throw new Error(error.message);
}

const FLAG_IDS: readonly string[] = SESSION_FLAGS.map((f) => f.id);

export async function submitSession(
  sessionId: string, flags: string[], overallNote?: string,
): Promise<void> {
  await requireUser();
  if (flags.some((f) => !FLAG_IDS.includes(f))) throw new Error("Unknown flag.");
  const db = await supabaseServer();
  const { data, error } = await db
    .from("revision_sessions")
    .update({
      submitted_at: new Date().toISOString(),
      flags,
      overall_note: overallNote?.trim() || null,
    })
    .eq("id", sessionId).is("submitted_at", null)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Session already submitted or not yours.");
  revalidatePath("/hifz");
  revalidatePath("/teacher/hifz");
}
