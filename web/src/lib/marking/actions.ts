"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentProfile } from "@/lib/supabase/server";
import { parseRubric } from "./objective";
import {
  mapWithConcurrency, planAnswerUpdates, planFinalMarks, planLlmJobs,
  type LlmMark, type MarkingAnswer, type MarkingQuestion,
} from "./plan";
import { markFreeText } from "./llm";

/**
 * The marking pipeline.
 *
 * submitted → [objective in code · free-text via Groq] → auto_marked
 *           → teacher accept-or-edit → approved
 *
 * Uses the service-role client because it writes marks across students;
 * every entry point checks the caller is a teacher first (except
 * markSubmission, which a student's own submit may trigger).
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
  if (rows.length) await db.from("answers").upsert(rows, { onConflict: "id" });

  await db
    .from("submissions")
    .update({ status: "auto_marked" })
    .eq("id", submissionId)
    .in("status", ["submitted", "auto_marked"]);

  revalidatePath("/teacher/homework");
}

/**
 * Teacher approval. `edits` overrides individual marks; anything not edited
 * takes the automatic mark (or 0 where there wasn't one). `comments` carries
 * the teacher's written feedback, which is released to the student by this same
 * write — so a comment never exists on a submission the student can't yet see.
 */
export async function approveSubmission(
  submissionId: string,
  edits: Record<string, number> = {},
  comments: Record<string, string> = {},
): Promise<void> {
  const teacher = await requireTeacher();
  const db = supabaseAdmin();

  const { data: answers } = await db
    .from("answers")
    .select("id, submission_id, question_id, response, auto_marks")
    .eq("submission_id", submissionId);
  if (!answers) throw new Error("Submission not found.");

  // every final mark and comment worked out in JS, then written in one go
  const rows = planFinalMarks(answers, edits, comments);
  if (rows.length) await db.from("answers").upsert(rows, { onConflict: "id" });

  await db
    .from("submissions")
    .update({
      status: "approved",
      approved_by: teacher.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", submissionId);

  revalidatePath("/teacher/homework");
  revalidatePath("/teacher/roster");
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
