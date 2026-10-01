"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer, currentProfile } from "@/lib/supabase/server";
import { isLate, missingTaskRecordings, parseStudentHomework } from "./logic";

/**
 * Student-side homework actions. These use the *user* client, so RLS enforces
 * ownership — a student can only ever touch their own draft.
 */

async function requireStudent() {
  const profile = await currentProfile();
  if (!profile) throw new Error("Not signed in.");
  return profile;
}

/**
 * Open a draft submission for this homework, for a caller that has already
 * established there is no submission yet.
 *
 * The homework page reads the student's submission to decide whether the form
 * is read-only, so `ensureSubmission`'s own lookup would repeat a query that
 * was answered a moment ago. This skips straight to the write. It is still
 * race-safe: `submissions` carries `unique (homework_id, student_id)`, so two
 * simultaneous first loads resolve to the same row instead of one of them
 * failing on the constraint.
 *
 * Callers that don't already know the answer want `ensureSubmission`.
 */
export async function createDraftSubmission(homeworkId: string): Promise<string> {
  const profile = await requireStudent();
  const db = await supabaseServer();

  const { data, error } = await db
    .from("submissions")
    .upsert(
      { homework_id: homeworkId, student_id: profile.id, status: "draft" },
      { onConflict: "homework_id,student_id" },
    )
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

/** Get-or-create the draft submission for this homework. */
export async function ensureSubmission(homeworkId: string): Promise<string> {
  const profile = await requireStudent();
  const db = await supabaseServer();

  const { data: existing } = await db
    .from("submissions")
    .select("id")
    .eq("homework_id", homeworkId)
    .eq("student_id", profile.id)
    .maybeSingle();
  if (existing) return existing.id;

  const { data, error } = await db
    .from("submissions")
    .insert({ homework_id: homeworkId, student_id: profile.id, status: "draft" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

/**
 * Longest answer, as stored JSON, that autosave accepts. Far past any honest
 * written answer; it stops a pasted essay or a scripted call filling the table.
 */
const MAX_RESPONSE_CHARS = 20_000;

/**
 * What a student-facing action reports. Returned rather than thrown because
 * Next.js replaces a thrown server-action message with a generic one in
 * production, so a student would never read the reason.
 */
export type ActionResult = { error: string | null };

/** Autosave one answer. Says so when it didn't land, so the form never shows
 *  "Draft saved" over an answer the database doesn't have. */
export async function saveAnswer(
  submissionId: string,
  questionId: string,
  response: unknown,
): Promise<ActionResult> {
  if ((JSON.stringify(response) ?? "").length > MAX_RESPONSE_CHARS) {
    return { error: "That answer is too long to save. Shorten it and try again." };
  }

  const db = await supabaseServer();
  const { data: sub } = await db
    .from("submissions").select("status").eq("id", submissionId).maybeSingle();
  if (!sub) return { error: "This homework could not be found. Reload the page." };
  if (sub.status !== "draft") {
    return { error: "This homework has already been handed in, so changes are not saved." };
  }

  const { error } = await db
    .from("answers")
    .upsert(
      { submission_id: submissionId, question_id: questionId, response: response as never },
      { onConflict: "submission_id,question_id" },
    );
  if (error) {
    console.error("saveAnswer failed", submissionId, questionId, error.message);
    return { error: "Your answer could not be saved. Check your connection and try again." };
  }
  return { error: null };
}

/**
 * Hand the work in. Late submissions are accepted and flagged — mid-year
 * joiners have to catch up, and lateness is a teacher's judgement (a strike),
 * not an automatic block.
 *
 * A task with no recording *is* a block, and it is checked here as well as in
 * the form: the button the form disables is the only thing stopping a second
 * tab, or a recording deleted after the page loaded.
 */
export async function submitHomework(submissionId: string): Promise<ActionResult> {
  const db = await supabaseServer();

  const { data: sub } = await db
    .from("submissions")
    .select("id, status, homework_id")
    .eq("id", submissionId)
    .maybeSingle();
  if (!sub) return { error: "This homework could not be found. Reload the page and try again." };
  if (sub.status !== "draft") {
    return { error: "This homework has already been handed in. Reload the page to see it." };
  }

  // The question list comes from the student RPC — the only route a student
  // has to the paper — with the answer keys stripped.
  const [{ data: hw }, { data: payload }, { data: notes }] = await Promise.all([
    db.from("homeworks").select("due_at, number").eq("id", sub.homework_id).single(),
    db.rpc("get_homework_for_student", { hw_id: sub.homework_id }),
    db.from("voice_notes").select("question_id").eq("submission_id", submissionId),
  ]);

  // A payload that won't parse is a fault in the RPC, not a student with work
  // outstanding, so it lets the hand-in through rather than stranding them.
  const parsed = parseStudentHomework(payload);
  if (parsed && missingTaskRecordings(parsed.questions, notes ?? []).length > 0) {
    return { error: "Record every task before you hand in." };
  }

  // Guarded on draft and read back: a write that failed, or that matched no
  // row because a second tab got there first, must not report success.
  const { data: handedIn, error } = await db
    .from("submissions")
    .update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
      is_late: isLate(new Date(), hw?.due_at ?? null),
    })
    .eq("id", submissionId)
    .eq("status", "draft")
    .select("id");
  if (error) {
    console.error("submitHomework failed", submissionId, error.message);
    return { error: "Your homework could not be handed in. Try again." };
  }
  if (!handedIn?.length) {
    return { error: "This homework has already been handed in. Reload the page to see it." };
  }

  revalidatePath(`/homework/${hw?.number ?? ""}`);
  revalidatePath("/homework");
  revalidatePath("/home");
  return { error: null };
}
