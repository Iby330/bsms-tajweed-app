/**
 * Pure planning for the marking batch — no IO, no model calls, no Supabase.
 *
 * `markSubmission` used to decide and write one answer at a time: score it,
 * maybe ask the model, UPDATE that row, move on. Separating the decisions from
 * the writes lets the whole submission be worked out first and saved in a
 * single upsert — and it puts the marking rules somewhere they can be tested
 * without a database or a paid token.
 *
 * Nothing here may import ./llm: this module is the half of the pipeline that
 * runs the same whether the model answered or not.
 */

import type { Json } from "@/lib/database.types";
import {
  parseOptions,
  parseRubric,
  scoreObjective,
  type AutoRubricResult,
  type MarkableQuestion,
  type RubricConcept,
} from "./objective";

/* ── row shapes ──────────────────────────────────────────────────────── */

export type MarkingQuestion = {
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

/**
 * The `answers` columns every write has to carry. `submission_id`,
 * `question_id` and `response` are NOT NULL in 0001_core.sql, and an upsert is
 * an INSERT that only discovers the conflict after Postgres has built the
 * candidate row — so they ride along unchanged rather than being left out.
 */
export type MarkingAnswer = {
  id: string;
  submission_id: string;
  question_id: string;
  response: Json;
};

/** Approval reads one column more: the mark to fall back on. */
export type MarkedAnswer = MarkingAnswer & { auto_marks: number | null };

/** What the model said about one answer — `FreeTextMarkResult` minus the
 *  model name, which nothing downstream stores. */
export type LlmMark = { marks: number; concepts: AutoRubricResult[] };

/** One free-text answer for the model: exactly the fields `markFreeText`
 *  wants, and nothing that could identify the student. */
export type LlmJob = {
  answerId: string;
  prompt: string;
  rubric: RubricConcept[];
  answer: string;
};

export type AnswerAutoMarkRow = MarkingAnswer & {
  auto_marks: number | null;
  auto_rubric: Json;
};

export type AnswerFinalMarkRow = MarkingAnswer & {
  final_marks: number;
  teacher_comment: string | null;
};

/* ── planning ────────────────────────────────────────────────────────── */

type Prepared = {
  answer: MarkingAnswer;
  objective: number | null;
  /** set only when code cannot mark this answer but a rubric says the model can */
  job: LlmJob | null;
};

/** Verbatim from the old loop: a response that isn't an object, or carries no
 *  `text`, reaches the model as "" — which it marks as a blank answer. */
function answerText(response: unknown): string {
  return typeof response === "object" && response !== null
    ? String((response as { text?: unknown }).text ?? "")
    : "";
}

/**
 * The old loop's body with the write taken out: pair each answer with its
 * question, score what code can score, and note the ones only the model can.
 * An answer whose question is missing is dropped here exactly as `continue`
 * dropped it before — those rows are never written.
 */
function prepare(
  answers: readonly MarkingAnswer[],
  questions: readonly MarkingQuestion[],
): Prepared[] {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const out: Prepared[] = [];

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

    const objective = scoreObjective(question, answer.response);
    const rubric = question.rubric;
    // free-text with a rubric → the model; without one → manual queue
    const job =
      objective === null && rubric?.length
        ? {
            answerId: answer.id,
            prompt: q.prompt,
            rubric,
            answer: answerText(answer.response),
          }
        : null;

    out.push({ answer, objective, job });
  }
  return out;
}

/** The answers the model has to see, in submission order. */
export function planLlmJobs(
  answers: readonly MarkingAnswer[],
  questions: readonly MarkingQuestion[],
): LlmJob[] {
  const jobs: LlmJob[] = [];
  for (const p of prepare(answers, questions)) {
    if (p.job) jobs.push(p.job);
  }
  return jobs;
}

/**
 * Answers + questions + whatever the model returned → the rows to upsert.
 *
 * `llmMarks` is keyed by answer id; a missing entry, or an explicit null (the
 * model was rate-limited past its retries, or never parsed), leaves the answer
 * exactly as the old loop left it — auto_marks null, auto_rubric null, i.e.
 * the teacher's manual queue.
 */
export function planAnswerUpdates(
  answers: readonly MarkingAnswer[],
  questions: readonly MarkingQuestion[],
  llmMarks: ReadonlyMap<string, LlmMark | null>,
): AnswerAutoMarkRow[] {
  return prepare(answers, questions).map(({ answer, objective, job }) => {
    let autoMarks = objective;
    let autoRubric: AutoRubricResult[] | null = null;

    if (job) {
      const result = llmMarks.get(job.answerId) ?? null;
      if (result) {
        autoMarks = result.marks;
        autoRubric = result.concepts;
      }
    }

    return {
      id: answer.id,
      submission_id: answer.submission_id,
      question_id: answer.question_id,
      response: answer.response,
      auto_marks: autoMarks,
      // jsonb column: AutoRubricResult[] carries no index signature
      auto_rubric: autoRubric as never,
    };
  });
}

/**
 * Approval: `edits` overrides individual marks, anything not edited takes the
 * automatic mark (or 0 where there wasn't one). Every answer on the submission
 * gets a final mark, question row or not.
 *
 * `comments` is the teacher's own feedback, keyed by answer id like `edits`.
 * It is written on EVERY row rather than only the ones carrying text — an
 * approved submission can be reopened and re-approved, and emptying the box has
 * to be able to take a released comment back down. A comment that is only
 * whitespace is stored as null, so nothing renders an empty grey box at the
 * student.
 */
export function planFinalMarks(
  answers: readonly MarkedAnswer[],
  edits: Record<string, number>,
  comments: Record<string, string> = {},
): AnswerFinalMarkRow[] {
  return answers.map((a) => {
    const edited = edits[a.id];
    const final =
      typeof edited === "number" && Number.isFinite(edited)
        ? edited
        : (a.auto_marks ?? 0);
    const comment = comments[a.id]?.trim();
    return {
      id: a.id,
      submission_id: a.submission_id,
      question_id: a.question_id,
      response: a.response,
      final_marks: final,
      teacher_comment: comment ? comment : null,
    };
  });
}

/* ── concurrency ─────────────────────────────────────────────────────── */

/**
 * Run `fn` over `items` with at most `limit` in flight; results come back in
 * input order.
 *
 * Rejection contract, chosen to match the one caller: the returned promise
 * rejects with the first error, like `Promise.all`. `markFreeText` answers a
 * rate limit, a bad reply or a dropped connection with `null` rather than a
 * throw, so the only thing that can reject here is a broken environment (no
 * GROQ_API_KEY) — which must abort the batch, exactly as the old sequential
 * loop did, instead of quietly writing "unmarkable" over every answer. Work
 * already in flight is not cancelled, and `Promise.all` observes those
 * promises, so a second failure is never an unhandled rejection.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  if (items.length === 0) return results;

  let next = 0;
  const workers = Math.max(1, Math.min(Math.trunc(limit), items.length));
  await Promise.all(
    Array.from({ length: workers }, async () => {
      for (let i = next++; i < items.length; i = next++) {
        results[i] = await fn(items[i], i);
      }
    }),
  );
  return results;
}
