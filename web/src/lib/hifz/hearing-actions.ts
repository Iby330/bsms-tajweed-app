"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { getCachedSurahs } from "@/lib/reference/cached";
import { memorisationList, type Surah } from "@/lib/hifz/pace";
import { requireOwnStudent, requireTeacher } from "@/lib/teacher/guards";
import { rangeSurahs } from "./hearings";
import { todaysMarkingSession } from "./hearing-queries";
import { logMistake, type MistakeLocation } from "./review-actions";
import type { Category } from "./mistake-taxonomy";

type Db = Awaited<ReturnType<typeof supabaseServer>>;

/**
 * The surah numbers on this student's own run. Not exported: every export
 * of a "use server" file is a callable server action.
 */
async function runFor(db: Db, studentId: string): Promise<Set<number>> {
  const [{ data: hp }, surahs] = await Promise.all([
    db.from("hifz_profiles").select("start_surah, target_count").eq("student_id", studentId).maybeSingle(),
    getCachedSurahs(),
  ]);
  const run = hp ? memorisationList(hp.start_surah, hp.target_count, surahs as Surah[]) : [];
  return new Set(run.map((r) => r.number));
}

/**
 * A tap on the Hear tab, saved at once for the student being heard. The
 * mark goes into this teacher's marking session on this student for today's
 * UK date, created by the first tap of the day: already submitted, so the
 * student sees it at once, and `counts_as_result = false`, so it never
 * decides passed or not passed (see surahState). Its range is the surah of
 * that first mark. One mark per word per session, as logMistake keeps it,
 * so tapping a word again today changes the mark. Returns the mark's id.
 */
export async function logHearingMistake(
  studentId: string,
  loc: MistakeLocation,
  category: Category,
  detail?: string,
  note?: string,
): Promise<string> {
  const me = await requireTeacher();
  await requireOwnStudent(studentId);
  const db = await supabaseServer();

  if (!Number.isInteger(loc.surah)) throw new Error("Unknown surah.");
  const run = await runFor(db, studentId);
  if (!run.has(loc.surah)) throw new Error("That surah is not on this student's run.");

  let session = await todaysMarkingSession(db, me.id, studentId);
  if (!session) {
    const now = new Date().toISOString();
    const { data, error } = await db
      .from("revision_sessions")
      .insert({
        reviewer_id: me.id, reciter_id: studentId, kind: "hearing",
        surah_number: loc.surah, to_surah_number: loc.surah,
        counts_as_result: false, submitted_at: now,
      })
      .select("id, started_at").single();
    if (error) throw new Error(error.message);
    session = data;
  }
  return logMistake(session.id, loc, category, detail, note);
}

/** Take back a mark from one of this teacher's own marking sessions. */
export async function removeHearingMistake(mistakeId: string): Promise<void> {
  const me = await requireTeacher();
  const db = await supabaseServer();
  const { data: mark } = await db
    .from("revision_mistakes").select("id, session_id").eq("id", mistakeId).maybeSingle();
  if (!mark) throw new Error("That mark is gone.");
  const { data: s } = await db
    .from("revision_sessions").select("id")
    .eq("id", mark.session_id).eq("reviewer_id", me.id)
    .eq("kind", "hearing").eq("counts_as_result", false)
    .maybeSingle();
  if (!s) throw new Error("Not your mark.");
  const { error } = await db.from("revision_mistakes").delete().eq("id", mistakeId);
  if (error) throw new Error(error.message);
}

export type Results = { from: number; to: number; passed: number[]; note?: string };

/**
 * Pass / Not passed, confirmed: the result for a range of the student's
 * run. For every surah in [to, from]: ticked → the pass record is upserted
 * (comment = note; passed_at untouched on a re-pass); unticked → any record
 * is deleted, which is what revokes an earlier pass — surahState
 * (hearings.ts) relies on exactly that. Records first, then the result
 * session (`counts_as_result = true`, submitted, the range and note), so a
 * failed record write leaves no result that lies. The passes then point at
 * that session. A retry after a failure part way is safe: the upsert
 * replays over the same row, and deleting a record already gone deletes
 * nothing.
 */
export async function recordResults(studentId: string, results: Results): Promise<void> {
  const me = await requireTeacher();
  await requireOwnStudent(studentId);
  const db = await supabaseServer();

  const { from, to, passed } = results;
  if (!Number.isInteger(from) || !Number.isInteger(to) || to > from) {
    throw new Error("The range ends before it starts.");
  }
  // The range must lie on the student's own run — a crafted range cannot
  // reach into surahs the student was never assigned.
  const onRun = await runFor(db, studentId);
  if (!onRun.has(from) || !onRun.has(to)) throw new Error("The range is not on this student's run.");

  const range = rangeSurahs(from, to);
  const ticked = new Set(passed);
  for (const p of ticked) if (!range.includes(p)) throw new Error("A ticked surah is outside the range.");
  const trimmed = results.note?.trim() || null;

  for (const surah of range) {
    if (ticked.has(surah)) {
      const { error } = await db.from("hifz_records").upsert(
        { student_id: studentId, surah_number: surah, teacher_comment: trimmed, marked_by: me.id },
        { onConflict: "student_id,surah_number" },
      );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db.from("hifz_records").delete()
        .eq("student_id", studentId).eq("surah_number", surah);
      if (error) throw new Error(error.message);
    }
  }

  const { data: session, error } = await db
    .from("revision_sessions")
    .insert({
      reviewer_id: me.id, reciter_id: studentId, kind: "hearing",
      surah_number: from, to_surah_number: to, counts_as_result: true,
      submitted_at: new Date().toISOString(), overall_note: trimmed,
    })
    .select("id").single();
  if (error) throw new Error(error.message);

  // session_id repoints to the most recent result that confirmed each
  // surah, not the first one that ever passed it.
  if (ticked.size) {
    const { error: linkErr } = await db.from("hifz_records")
      .update({ session_id: session.id })
      .eq("student_id", studentId).in("surah_number", [...ticked]);
    if (linkErr) throw new Error(linkErr.message);
  }

  revalidatePath("/hifdh");
  revalidatePath("/teacher/hifdh");
  revalidatePath(`/teacher/hifdh/${studentId}`);
  for (const surah of range) {
    revalidatePath(`/hifdh/${surah}`);
    revalidatePath(`/teacher/hifdh/${studentId}/${surah}`);
  }
}
