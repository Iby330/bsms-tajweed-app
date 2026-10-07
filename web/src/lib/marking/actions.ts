"use server";

import { refresh, revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentProfile } from "@/lib/supabase/server";
import { parseRubric } from "./objective";
import {
  mapWithConcurrency, planAnswerUpdates, planFinalMarks, planLlmJobs,
  type LlmMark, type MarkingAnswer, type MarkingQuestion,
} from "./plan";
import { markFreeText } from "./llm";
import { APPROVABLE_STATUSES, canApprove, redoVerdict } from "./redo";
import { emailMarkedHomework } from "./notify";
import { teacherClasses } from "@/lib/teacher/scope";

/**
 * The marking pipeline.
 *
 * submitted → [objective in code · free-text via Groq] → auto_marked
 *           → teacher accept-or-edit → approved
 *
 * Uses the service-role client because it writes marks across students;
 * every entry point checks the caller is a teacher first. Marking is started
 * by the teacher's review pages, never by a student's hand-in.
 *
 * This file is `use server`, so only the actions may be exported from it —
 * the marking rules themselves live, pure and tested, in ./plan and
 * ./objective.
 */

/**
 * Free-text answers sent to the model at once. The count of requests per
 * submission is unchanged — only their spacing — so the free tier's 30/min
 * budget is spent no faster than the old one-at-a-time loop spent it, and
 * markFreeText still backs off on a 429.
 */
const LLM_CONCURRENCY = 5;

async function requireTeacher() {
  const profile = await currentProfile();
  if (!profile || profile.role !== "teacher") {
    throw new Error("Only teachers can do that.");
  }
  return profile;
}


/**
 * Score every answer on a submission. Idempotent: safe to call again.
 * Objective questions are scored instantly in code; free-text answers with a
 * rubric go to the LLM, a few at a time, and the whole submission is then
 * saved in one write.
 *
 * `hint` is the caller saying it already knows which homework this is — the
 * review page has just read the submission row — which lets all three reads
 * leave together instead of two of them waiting on the first.
 */
export async function markSubmission(
  submissionId: string,
  hint?: { homeworkId: string },
): Promise<void> {
  // An exported server action is a public endpoint: without this, anyone
  // signed in could make the service-role client mark any submission.
  await requireTeacher();
  const db = supabaseAdmin();

  const submissionRead = db
    .from("submissions")
    .select("id, status, homework_id")
    .eq("id", submissionId)
    .single();
  const answerRead = db
    .from("answers")
    .select("id, submission_id, question_id, response")
    .eq("submission_id", submissionId);
  const questionRead = (homeworkId: string) =>
    db
      .from("questions")
      .select("id, qtype, scoring, points, prompt, is_bonus, is_task, options, rubric")
      .eq("homework_id", homeworkId);

  let submission: { status: string } | null;
  let answers: MarkingAnswer[] | null;
  let questions: MarkingQuestion[] | null;

  if (hint) {
    const [s, a, q] = await Promise.all([
      submissionRead,
      answerRead,
      questionRead(hint.homeworkId),
    ]);
    submission = s.data;
    answers = a.data;
    questions = q.data;
  } else {
    // no hint: the submission row has to come back first, it names the homework
    const s = await submissionRead;
    if (!s.data) throw new Error("Submission not found.");
    const [a, q] = await Promise.all([answerRead, questionRead(s.data.homework_id)]);
    submission = s.data;
    answers = a.data;
    questions = q.data;
  }

  if (!submission) throw new Error("Submission not found.");
  if (submission.status === "approved") return; // already finalised
  if (!answers?.length) return;

  const jobs = planLlmJobs(answers, questions ?? []);
  const marked = await mapWithConcurrency(jobs, LLM_CONCURRENCY, (job) =>
    markFreeText({ prompt: job.prompt, rubric: job.rubric, answer: job.answer }),
  );
  const llmMarks = new Map<string, LlmMark | null>(
    jobs.map((job, i) => [job.answerId, marked[i]]),
  );

  // one write for the submission: every answer row, marks and all
  const rows = planAnswerUpdates(answers, questions ?? [], llmMarks);
  if (rows.length) {
    const { error } = await db.from("answers").upsert(rows, { onConflict: "id" });
    // Not flipped to auto_marked over marks that never landed.
    if (error) throw new Error(`Could not save the marks: ${error.message}`);
  }

  const { error: statusError } = await db
    .from("submissions")
    .update({ status: "auto_marked" })
    .eq("id", submissionId)
    .in("status", ["submitted", "auto_marked"]);
  if (statusError) throw new Error(statusError.message);

  revalidatePath("/teacher/homework");
}

/**
 * Teacher approval. `edits` overrides individual marks; anything not edited
 * takes the automatic mark (or 0 where there wasn't one). `comments` carries
 * the teacher's written feedback, which is released to the student by this same
 * write — so a comment never exists on a submission the student can't yet see.
 *
 * Releasing a mark below the pass threshold sends the paper straight back for a
 * redo, in the same press: `open_homework_redo` snapshots the attempt, clears
 * the answers and reopens the submission as a blank draft (see
 * docs/superpowers/specs/2026-09-15-homework-redo-design.md). That is why this
 * returns the verdict rather than nothing — the review panel has to know
 * whether the page it is sitting on still has a script on it.
 *
 * `pct` is null when no verdict was possible at all (ungraded homework, a
 * total carried over from the spreadsheet, a paper worth no marks); it is a
 * number on every ordinary release, pass or fail.
 */
export async function approveSubmission(
  submissionId: string,
  edits: Record<string, number> = {},
  comments: Record<string, string> = {},
): Promise<{ pct: number | null; redo: boolean }> {
  const teacher = await requireTeacher();
  const db = supabaseAdmin();

  // The answers and the row they hang off name each other by id, so neither
  // waits on the other.
  const [{ data: answers }, { data: submission }] = await Promise.all([
    db
      .from("answers")
      .select("id, submission_id, question_id, response, auto_marks")
      .eq("submission_id", submissionId),
    db
      .from("submissions")
      .select("status, attempt, imported_marks, homework_id, student_id")
      .eq("id", submissionId)
      .maybeSingle(),
  ]);
  if (!answers || !submission) throw new Error("Submission not found.");
  // Before any answer is written: a draft (a redo in progress, reached by
  // the back button or a second tab) has nothing to approve.
  if (!canApprove(submission.status)) throw new Error("This submission is not waiting to be marked.");

  // The paper itself can only be asked for once the submission has named it,
  // so it is a second trip — but one trip, not two: the questions the pass
  // mark is worked out over ride back embedded in the homework row.
  const { data: homework } = await db
    .from("homeworks")
    .select("number, total_marks, is_graded, questions(id, is_bonus)")
    .eq("id", submission.homework_id)
    .maybeSingle();

  // every final mark and comment worked out in JS, then written in one go
  const rows = planFinalMarks(answers, edits, comments);
  if (rows.length) {
    const { error } = await db.from("answers").upsert(rows, { onConflict: "id" });
    // Before the release: approved over marks that failed to save would show
    // the student a total made of the old ones.
    if (error) throw new Error(`Could not save the marks: ${error.message}`);
  }

  // Guarded as well as checked above: a second click racing the first can
  // land after the first one's redo has reopened the row as a draft, and
  // must not flip that fresh redo back to approved.
  const { data: released, error: releaseError } = await db
    .from("submissions")
    .update({
      status: "approved",
      approved_by: teacher.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", submissionId)
    .in("status", [...APPROVABLE_STATUSES])
    .select("id");
  if (releaseError) throw new Error(releaseError.message);
  if (!released?.length) throw new Error("This submission is not waiting to be marked.");

  revalidatePath("/teacher/homework");
  revalidatePath("/teacher/roster");
  // The marking page stays on the script after a release, so the response
  // carries its re-render. Done here rather than with router.refresh() in the
  // client's transition, which in Next 16 left the button on "Saving…".
  refresh();

  // The marks that were just written, not the ones that were read — an edit of
  // an already-released submission is the case where those differ, and it is
  // exactly the case that can push a pass down below the line.
  const verdict = homework
    ? redoVerdict(rows, homework.questions ?? [], homework, submission)
    : null;
  const result = verdict?.redo
    ? await sendBack(submissionId, verdict.pct, homework!.number)
    : { pct: verdict?.pct ?? null, redo: false };

  // The student hears once per attempt: on its first release, not on every
  // "Edit marks" afterwards. A submission carried over from the spreadsheet
  // has no answers to show, so it gets no email either.
  if (submission.status !== "approved" && rows.length) {
    await emailMarkedHomework({
      studentId: submission.student_id,
      homeworkId: submission.homework_id,
      teacher: { fullName: teacher.full_name ?? null, section: teacher.section ?? null },
      pct: result.pct,
      redo: result.redo,
      answers: rows,
    });
  }
  return result;
}

/** Below the pass mark: reopen the paper as a blank redo. */
async function sendBack(
  submissionId: string,
  pct: number,
  homeworkNumber: number,
): Promise<{ pct: number; redo: true }> {
  const db = supabaseAdmin();

  const { error } = await db.rpc("open_homework_redo", {
    sub_id: submissionId,
    failed_pct: pct,
  });
  // Loudly: the marks are already released, so a failure here leaves a student
  // holding a fail with no way to sit it again. Better the teacher sees it.
  if (error) throw new Error(`Could not send this submission back: ${error.message}`);

  // The student's own three views of it: the hero that lists what needs them,
  // their progress rows, and the paper itself, now blank again.
  revalidatePath("/home");
  revalidatePath("/progress");
  revalidatePath(`/homework/${homeworkNumber}`);

  return { pct, redo: true };
}

/**
 * Give a handed-in paper back to the student, answers and all.
 *
 * For the student who pressed hand-in by mistake, or before they had
 * finished. Unlike a redo it keeps what they wrote and recorded: the paper
 * goes back to a draft exactly as they left it, the same attempt, and they
 * carry on and hand it in again. Any marks the model gave it are cleared, so
 * the next hand-in is marked afresh rather than shown with stale ones.
 *
 * Only before release. A released mark has been seen, and taking it back is a
 * different act from undoing a hand-in.
 *
 * The student's own policies never allow submitted to draft (the
 * guard_student_submission trigger), which is why this is a teacher action on
 * the service role. Lateness is stamped again on the next hand-in, against
 * the student's deadline as it then stands.
 */
export async function reopenSubmission(submissionId: string): Promise<{ error: string | null }> {
  await requireTeacher();
  const db = supabaseAdmin();

  const [allowed, { data: sub }] = await Promise.all([
    teacherClasses(),
    db
      .from("submissions")
      .select("status, student_id, profiles!submissions_student_id_fkey(class_id), homeworks(number)")
      .eq("id", submissionId)
      .maybeSingle(),
  ]);
  if (!sub) return { error: "This submission could not be found." };
  // The same section boundary the marking page draws.
  if (allowed.length && !allowed.some((c) => c.id === sub.profiles?.class_id)) {
    return { error: "This student is not in a class you teach." };
  }

  // Guarded, so a paper approved in another tab a moment ago stays released.
  const { data: reopened, error } = await db
    .from("submissions")
    .update({ status: "draft", submitted_at: null, is_late: false })
    .eq("id", submissionId)
    .in("status", ["submitted", "auto_marked"])
    .select("id");
  if (error) return { error: error.message };
  if (!reopened?.length) {
    return { error: "Only handed-in work that has not been released can be reopened." };
  }

  const { error: clearError } = await db
    .from("answers")
    .update({ auto_marks: null, auto_rubric: null, final_marks: null, teacher_comment: null })
    .eq("submission_id", submissionId);
  if (clearError) console.error("reopenSubmission: marks not cleared", submissionId, clearError.message);

  revalidatePath("/teacher/homework");
  revalidatePath(`/teacher/roster/${sub.student_id}`);
  if (sub.homeworks) revalidatePath(`/homework/${sub.homeworks.number}`);
  revalidatePath("/home");
  refresh();
  return { error: null };
}

/** Re-run the model on a single answer (teacher pressed "re-mark"). */
export async function remarkAnswer(answerId: string): Promise<void> {
  await requireTeacher();
  const db = supabaseAdmin();

  const { data: answer } = await db
    .from("answers")
    .select("id, response, submission_id, question_id")
    .eq("id", answerId)
    .single();
  if (!answer) throw new Error("Answer not found.");

  const { data: q } = await db
    .from("questions")
    .select("prompt, rubric, points")
    .eq("id", answer.question_id)
    .single();
  const rubric = parseRubric(q?.rubric);
  if (!q || !rubric?.length) return;

  const text =
    typeof answer.response === "object" && answer.response !== null
      ? String((answer.response as { text?: unknown }).text ?? "")
      : "";

  const result = await markFreeText({ prompt: q.prompt, rubric, answer: text });
  if (!result) return;

  await db
    .from("answers")
    .update({ auto_marks: result.marks, auto_rubric: result.concepts as never })
    .eq("id", answerId);

  revalidatePath(`/teacher/homework/submission/${answer.submission_id}`);
}
