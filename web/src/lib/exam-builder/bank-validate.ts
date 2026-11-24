/**
 * The admin review's input checks: what an edit to a BANK question may carry.
 * Pure, so they are unit-tested and the "use server" bank-actions file (which
 * may export only async functions) imports them.
 *
 * The question's own fields reuse the paper-item cleaner in ./validate (same
 * limits: prompt 1–4000, options ≤ 10 × ≤ 500, pictures from our bucket), so
 * a question reads the same in the bank as on a paper. What differs here:
 * marks may be blank (null = "not set yet"), and a bank question also has a
 * topic, its "used in" labels and a review status.
 */
import type { McqOption, QuestionKind, ReviewStatus } from "./types";
import { cleanItemPatch, isValidMarks, type ItemPatch } from "./validate";

export const BANK_LIMITS = { usedIn: 20, usedInLabel: 40, topicId: 100 } as const;

export type BankPatch = Omit<ItemPatch, "marks" | "answer_lines"> & {
  marks?: number | null;
  topic_id?: string;
  used_in?: string[];
  review_status?: ReviewStatus;
};

type Clean<T> = { ok: true; patch: T } | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** The question fields shared with a paper item (marks and the rest are handled here). */
const ITEM_KEYS = ["kind", "prompt", "answer", "select_many", "options", "prompt_quran", "prompt_images"] as const;

/** Marks for a bank question: blank (null) or 0.5–100 in halves. */
export function isValidBankMarks(v: unknown): v is number | null {
  return v === null || isValidMarks(v);
}

/**
 * "Used in" labels such as "EOT2 25/26": trimmed, blanks dropped, repeats
 * dropped (first spelling kept), at most 20 of at most 40 characters.
 */
export function cleanUsedIn(v: unknown): Clean<string[]> {
  if (!Array.isArray(v) || !v.every((s) => typeof s === "string")) return fail("The “used in” labels must be text.");
  const out: string[] = [];
  for (const raw of v as string[]) {
    const s = raw.trim().replace(/\s+/g, " ");
    if (!s) continue;
    if (s.length > BANK_LIMITS.usedInLabel) {
      return fail(`A “used in” label can be at most ${BANK_LIMITS.usedInLabel} characters.`);
    }
    if (!out.some((o) => o.toLowerCase() === s.toLowerCase())) out.push(s);
  }
  if (out.length > BANK_LIMITS.usedIn) return fail(`A question can list at most ${BANK_LIMITS.usedIn} exams.`);
  return { ok: true, patch: out };
}

/**
 * An edit to a bank question, trimmed and checked. Keys it does not know are
 * dropped. Whether the topic exists, and whether a multiple-choice question
 * still has two options once merged with what is stored, are checked by the
 * action (they need the database / the current row): see `mcqProblem`.
 */
export function cleanBankPatch(input: unknown): Clean<BankPatch> {
  if (!isObject(input)) return fail("Nothing to change.");
  const patch: BankPatch = {};

  const itemInput: Record<string, unknown> = {};
  for (const k of ITEM_KEYS) if (input[k] !== undefined) itemInput[k] = input[k];
  if (Object.keys(itemInput).length > 0) {
    const item = cleanItemPatch(itemInput);
    if (!item.ok) return item;
    Object.assign(patch, item.patch);
  }

  if (input.marks !== undefined) {
    if (!isValidBankMarks(input.marks)) return fail("Marks must be blank, or between 0.5 and 100 in halves.");
    patch.marks = input.marks;
  }

  if (input.topic_id !== undefined) {
    if (typeof input.topic_id !== "string" || !input.topic_id.trim()) return fail("Pick a topic.");
    const id = input.topic_id.trim();
    if (id.length > BANK_LIMITS.topicId) return fail("That topic isn't in the bank.");
    patch.topic_id = id;
  }

  if (input.used_in !== undefined) {
    const used = cleanUsedIn(input.used_in);
    if (!used.ok) return used;
    patch.used_in = used.patch;
  }

  if (input.review_status !== undefined) {
    const s = input.review_status;
    if (s !== "clean" && s !== "check" && s !== "approved") return fail("That isn't a review status.");
    patch.review_status = s;
  }

  if (Object.keys(patch).length === 0) return fail("Nothing to change.");
  return { ok: true, patch };
}

/** An option with something in it: text, a picture, or Qur'an words to typeset. */
export function optionFilled(o: McqOption): boolean {
  return !!(o.text.trim() || o.image || o.quran);
}

/**
 * Why a question would not work as multiple choice once the edit is applied,
 * or null. A multiple-choice question needs at least two options with
 * something in them (text, a picture or Qur'an words to typeset).
 */
export function mcqProblem(kind: QuestionKind, options: McqOption[] | null | undefined): string | null {
  if (kind !== "mcq") return null;
  const filled = (options ?? []).filter(optionFilled);
  if (filled.length < 2) return "A multiple-choice question needs at least two options.";
  return null;
}

/** "a | b; c" → ["a", "b; c"]: the merge joined one note per source with " | ". */
export function splitReviewNote(note: string | null | undefined): string[] {
  if (!note) return [];
  return note.split(/\s+\|\s+/).map((s) => s.trim()).filter(Boolean);
}
