/**
 * A question a teacher writes in the builder (or on the bank page): what it
 * may carry, checked before it goes into the bank or onto a paper. Pure, so it
 * is unit-tested and the "use server" new-question-actions file (which may
 * export only async functions) imports it.
 *
 * The question's own fields reuse the paper-item cleaner in ./validate, so a
 * written question reads the same as an imported one. What is added here: a
 * topic is required, marks are required, a multiple-choice question needs two
 * options, and its pictures must be ones a teacher uploaded (`new/…`).
 */
import { mcqProblem } from "./bank-validate";
import type { McqOption, QuestionKind, QuranRef, SourceRef } from "./types";
import { cleanItemPatch } from "./validate";

export type NewQuestion = {
  topic_id: string;
  kind: QuestionKind;
  prompt: string;
  prompt_images: string[];
  /** An ayah to typeset from the mushaf instead of a picture. */
  prompt_quran: QuranRef | null;
  options: McqOption[] | null;
  select_many: boolean;
  answer: string | null;
  marks: number;
};

type Clean<T> = { ok: true; value: T } | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** A picture uploaded with a new question: `new/<profile id>/<file>`. */
export function isOwnUpload(path: unknown, profileId: string): path is string {
  if (typeof path !== "string") return false;
  const prefix = `new/${profileId}/`;
  if (!path.startsWith(prefix)) return false;
  const file = path.slice(prefix.length);
  return /^[\w\-.]+$/.test(file) && !file.includes("..");
}

/**
 * A new question, trimmed and checked. Options with nothing in them are
 * dropped; a short answer carries no options.
 */
export function cleanNewQuestion(input: unknown): Clean<NewQuestion> {
  if (!isObject(input)) return fail("Nothing to save.");
  const topic = typeof input.topic_id === "string" ? input.topic_id.trim() : "";
  if (!topic || topic.length > 100) return fail("Pick a topic.");
  if (input.kind !== "mcq" && input.kind !== "short") return fail("A question is multiple choice or short answer.");
  if (typeof input.prompt !== "string" || !input.prompt.trim()) return fail("The question can't be empty.");
  if (input.marks === undefined || input.marks === null) return fail("Marks must be between 0.5 and 100, in halves.");

  const kind = input.kind;
  const options = kind === "mcq" && Array.isArray(input.options)
    ? (input.options as McqOption[]).filter((o) => isObject(o) && ((typeof o.text === "string" && o.text.trim()) || o.image))
    : null;

  const item = cleanItemPatch({
    kind,
    prompt: input.prompt,
    marks: input.marks,
    answer: input.answer ?? null,
    select_many: kind === "mcq" ? input.select_many === true : false,
    prompt_images: input.prompt_images ?? [],
    prompt_quran: input.prompt_quran ?? null,
    ...(kind === "mcq" ? { options: options ?? [] } : {}),
  });
  if (!item.ok) return item;
  const p = item.patch;

  const opts = kind === "mcq" ? p.options ?? [] : null;
  const problem = mcqProblem(kind, opts);
  if (problem) return fail(problem);
  if ((p.prompt_images ?? []).some((path) => !path.startsWith("new/"))) return fail("A picture is not one of ours.");

  return {
    ok: true,
    value: {
      topic_id: topic,
      kind,
      prompt: p.prompt!,
      prompt_images: p.prompt_images ?? [],
      prompt_quran: p.prompt_quran ?? null,
      options: opts,
      select_many: p.select_many ?? false,
      answer: p.answer ?? null,
      marks: p.marks!,
    },
  };
}

/** Where a teacher-written question came from: "Ibrahim Ramadan, Nov 2026". */
export function writtenSource(fullName: string | null | undefined, at: Date = new Date()): SourceRef {
  const month = at.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "Europe/London" });
  const who = fullName?.trim() || "A teacher";
  return { label: `${who}, ${month}`, kind: "bank" };
}
