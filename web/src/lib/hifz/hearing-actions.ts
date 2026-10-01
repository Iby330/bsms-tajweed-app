"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { getCachedSurahs } from "@/lib/reference/cached";
import { memorisationList, type Surah } from "@/lib/hifz/pace";
import { requireOwnStudent, requireTeacher } from "@/lib/teacher/guards";
import { rangeSurahs } from "./hearings";

/**
 * The teacher's open hearing on this student — wherever it started — or a
 * new one starting at `fromSurah`. Called on the FIRST TAP or at Finish,
 * never on opening a page. One open draft per teacher per student.
 */
export async function startHearing(studentId: string, fromSurah: number): Promise<string> {
  const me = await requireTeacher();
  await requireOwnStudent(studentId);
  const db = await supabaseServer();

  const { data: existing } = await db
    .from("revision_sessions").select("id")
    .eq("reviewer_id", me.id).eq("reciter_id", studentId).eq("kind", "hearing")
    .is("submitted_at", null)
    .order("started_at", { ascending: true }).limit(1).maybeSingle();
  if (existing) return existing.id;

  // An off-run start would make a draft submitHearing can never accept, and
  // nothing deletes a draft, so it would block hearing this student for good.
  const run = await runFor(db, studentId);
  if (!run.has(fromSurah)) throw new Error("That surah is not on this student's run.");

  const { data, error } = await db
    .from("revision_sessions")
    .insert({
      reviewer_id: me.id, reciter_id: studentId, kind: "hearing",
      surah_number: fromSurah, to_surah_number: fromSurah,
    })
    .select("id").single();
  if (error) throw new Error(error.message);
  return data.id;
}

/**
 * The surah numbers on this student's own run. Not exported: every export
 * of a "use server" file is a callable server action.
 */
async function runFor(db: Awaited<ReturnType<typeof supabaseServer>>, studentId: string): Promise<Set<number>> {
  const [{ data: hp }, surahs] = await Promise.all([
    db.from("hifz_profiles").select("start_surah, target_count").eq("student_id", studentId).maybeSingle(),
    getCachedSurahs(),
  ]);
  const run = hp ? memorisationList(hp.start_surah, hp.target_count, surahs as Surah[]) : [];
  return new Set(run.map((r) => r.number));
}

export type HearingVerdict = { to: number; passed: number[]; note?: string };

/**
 * Finish. For every surah in [to, from]: ticked → the pass record is
 * upserted (comment = note, session_id = this hearing; passed_at untouched
 * on a re-pass); unticked → any record is deleted, which is what revokes an
 * earlier pass — surahState (hearings.ts) relies on exactly that. Records
 * first, then the session, so a failed record write leaves the hearing
 * open rather than a submitted hearing that lies. A retry after a mid-range
 * failure is safe: the upsert simply replays over the same row, and
 * deleting a record that is already gone deletes nothing.
 */
export async function submitHearing(sessionId: string, verdict: HearingVerdict): Promise<void> {
  const me = await requireTeacher();
  const db = await supabaseServer();

  const { data: s } = await db
    .from("revision_sessions").select("id, reciter_id, surah_number")
    .eq("id", sessionId).eq("reviewer_id", me.id).eq("kind", "hearing").is("submitted_at", null)
    .maybeSingle();
  if (!s || s.surah_number === null) throw new Error("Hearing already submitted or not yours.");
  await requireOwnStudent(s.reciter_id);

  const from = s.surah_number;
  const { to, passed } = verdict;
  if (!Number.isInteger(to) || to > from) throw new Error("The range ends before it starts.");

  // The range must lie on the student's own run — a crafted `to` cannot
  // reach into surahs the student was never assigned.
  const onRun = await runFor(db, s.reciter_id);
  if (!onRun.has(from) || !onRun.has(to)) throw new Error("The range is not on this student's run.");

  const range = rangeSurahs(from, to);
  const ticked = new Set(passed);
  for (const p of ticked) if (!range.includes(p)) throw new Error("A ticked surah is outside the range.");
  const trimmed = verdict.note?.trim() || null;

  for (const surah of range) {
    if (ticked.has(surah)) {
      const { error } = await db.from("hifz_records").upsert(
        // session_id repoints to the most recent hearing that confirmed
        // this surah, not the first one that ever passed it.
        { student_id: s.reciter_id, surah_number: surah, teacher_comment: trimmed, marked_by: me.id, session_id: s.id },
        { onConflict: "student_id,surah_number" },
      );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db.from("hifz_records").delete()
        .eq("student_id", s.reciter_id).eq("surah_number", surah);
      if (error) throw new Error(error.message);
    }
  }

  const { error } = await db
    .from("revision_sessions")
    .update({ submitted_at: new Date().toISOString(), to_surah_number: to, overall_note: trimmed })
    .eq("id", s.id).is("submitted_at", null);
  if (error) throw new Error(error.message);

  revalidatePath("/hifdh");
  revalidatePath("/teacher/hifdh");
  revalidatePath("/teacher/hifdh/hear");
  revalidatePath(`/teacher/hifdh/${s.reciter_id}`);
  for (const surah of range) {
    revalidatePath(`/hifdh/${surah}`);
    revalidatePath(`/teacher/hifdh/${s.reciter_id}/${surah}`);
  }
}
