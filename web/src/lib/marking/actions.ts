"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentProfile } from "@/lib/supabase/server";
import {
  scoreObjective, parseOptions, parseRubric,
  type MarkableQuestion, type AutoRubricResult,
} from "./objective";
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
 */

type QuestionRow = {
  id: string;
  qtype: MarkableQuestion["qtype"];
  scoring: MarkableQuestion["scoring"];
  points: number;
  prompt: string;
  is_bonus: boolean;
  is_task: boolean;
  options: unknown;
  rubric: unknown;
};

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
 * rubric go to the LLM one at a time (sequential — the free tier is 30/min).
 */
export async function markSubmission(submissionId: string): Promise<void> {
  const db = supabaseAdmin();

  const { data: submission } = await db
    .from("submissions")
    .select("id, status, homework_id")
    .eq("id", submissionId)
    .single();
  if (!submission) throw new Error("Submission not found.");
  if (submission.status === "approved") return; // already finalised

  const { data: answers } = await db
    .from("answers")
    .select("id, question_id, response")
    .eq("submission_id", submissionId);
  if (!answers?.length) return;

  const { data: questions } = await db
    .from("questions")
    .select("id, qtype, scoring, points, prompt, is_bonus, is_task, options, rubric")
    .eq("homework_id", submission.homework_id);
  const byId = new Map((questions ?? []).map((q) => [q.id, q as QuestionRow]));

  for (const answer of answers) {
    const q = byId.get(answer.question_id);
    if (!q) continue;

    const question: MarkableQuestion = {
      qtype: q.qtype,
      scoring: q.scoring,
      points: Number(q.points),
      is_bonus: q.is_bonus,
      is_task: q.is_task,
      options: parseOptions(q.options),
      rubric: parseRubric(q.rubric),
    };

    let autoMarks = scoreObjective(question, answer.response);
    let autoRubric: AutoRubricResult[] | null = null;

    // free-text with a rubric → the model; without one → manual queue
    if (autoMarks === null && question.rubric?.length) {
      const text =
        typeof answer.response === "object" && answer.response !== null
          ? String((answer.response as { text?: unknown }).text ?? "")
          : "";
      const result = await markFreeText({
        prompt: q.prompt,
        rubric: question.rubric,
        answer: text,
      });
      if (result) {
        autoMarks = result.marks;
        autoRubric = result.concepts;
      }
    }

    await db
      .from("answers")
      .update({ auto_marks: autoMarks, auto_rubric: autoRubric as never })
      .eq("id", answer.id);
  }

  await db
    .from("submissions")
    .update({ status: "auto_marked" })
    .eq("id", submissionId)
    .in("status", ["submitted", "auto_marked"]);

  revalidatePath("/teacher/homework");
}

/**
 * Teacher approval. `edits` overrides individual marks; anything not edited
 * takes the automatic mark (or 0 where there wasn't one).
 */
export async function approveSubmission(
  submissionId: string,
  edits: Record<string, number> = {},
): Promise<void> {
  const teacher = await requireTeacher();
  const db = supabaseAdmin();

  const { data: answers } = await db
    .from("answers")
    .select("id, auto_marks")
    .eq("submission_id", submissionId);
  if (!answers) throw new Error("Submission not found.");

  for (const a of answers) {
    const edited = edits[a.id];
    const final =
      typeof edited === "number" && Number.isFinite(edited)
        ? edited
        : (a.auto_marks ?? 0);
    await db.from("answers").update({ final_marks: final }).eq("id", a.id);
  }

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
