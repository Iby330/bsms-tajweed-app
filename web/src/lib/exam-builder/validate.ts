/**
 * The exam-builder actions' input checks and ordering arithmetic. Pure, so
 * they are unit-tested here and the "use server" file (which may export only
 * async functions) imports them.
 *
 * Every cleaner takes `unknown`: a server action is a public POST endpoint and
 * its arguments are whatever the caller sent, not what TypeScript promised.
 */
import { parseQuranRef } from "./parse";
import type { McqOption, Paper, PaperItem, Practical, QuestionKind, QuranRef } from "./types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

type Clean<T> = { ok: true; patch: T } | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// ── papers ─────────────────────────────────────────────────────────────────

export type PaperPatch = Partial<
  Pick<Paper, "name" | "title" | "date_label" | "duration_label" | "code" | "season" | "notes">
>;

export const PAPER_LIMITS = { name: 60, title: 200, short: 60, notes: 12, noteLength: 400 } as const;

/**
 * True when the patch changes only the paper's name. The name is for the
 * teacher (it is never printed and is not part of the "used in" stamp), so
 * this is the one change a final paper still takes.
 */
export function isNameOnly(patch: PaperPatch): boolean {
  const keys = Object.keys(patch);
  return keys.length === 1 && keys[0] === "name";
}

const PAPER_SHORT_FIELDS = ["date_label", "duration_label", "code", "season"] as const;
const SHORT_FIELD_NAMES: Record<(typeof PAPER_SHORT_FIELDS)[number], string> = {
  date_label: "The date",
  duration_label: "The duration",
  code: "The code",
  season: "The season",
};

/**
 * A paper header edit, trimmed and checked. Keys it does not know are
 * dropped. The name (the teacher's own label, "Advanced", never printed) may
 * be blank and is at most 60 characters. The title, code and season cannot be blank (the code and season
 * make the "EOT1 26/27" stamp); the date and duration can. Notes are trimmed
 * and blank lines dropped. Too long is refused, not cut short.
 */
export function cleanPaperPatch(input: unknown): Clean<PaperPatch> {
  if (!isObject(input)) return fail("Nothing to change.");
  const patch: PaperPatch = {};

  if (input.name !== undefined) {
    if (typeof input.name !== "string") return fail("The paper name must be text.");
    const name = input.name.trim();
    if (name.length > PAPER_LIMITS.name) return fail(`The paper name can be at most ${PAPER_LIMITS.name} characters.`);
    patch.name = name;
  }

  if (input.title !== undefined) {
    if (typeof input.title !== "string") return fail("The title must be text.");
    const title = input.title.trim();
    if (!title) return fail("The paper needs a title.");
    if (title.length > PAPER_LIMITS.title) return fail(`The title can be at most ${PAPER_LIMITS.title} characters.`);
    patch.title = title;
  }

  for (const key of PAPER_SHORT_FIELDS) {
    const v = input[key];
    if (v === undefined) continue;
    const name = SHORT_FIELD_NAMES[key];
    if (typeof v !== "string") return fail(`${name} must be text.`);
    const s = v.trim();
    if (s.length > PAPER_LIMITS.short) return fail(`${name} can be at most ${PAPER_LIMITS.short} characters.`);
    if (!s && key === "code") return fail("The paper needs a code, such as EOT1.");
    if (!s && key === "season") return fail("The paper needs a season, such as 26/27.");
    patch[key] = s;
  }

  if (input.notes !== undefined) {
    if (!Array.isArray(input.notes) || !input.notes.every((n) => typeof n === "string")) {
      return fail("The notes must be lines of text.");
    }
    const notes = (input.notes as string[]).map((n) => n.trim()).filter(Boolean);
    if (notes.length > PAPER_LIMITS.notes) return fail(`A paper can have at most ${PAPER_LIMITS.notes} notes.`);
    if (notes.some((n) => n.length > PAPER_LIMITS.noteLength)) {
      return fail(`Each note can be at most ${PAPER_LIMITS.noteLength} characters.`);
    }
    patch.notes = notes;
  }

  if (Object.keys(patch).length === 0) return fail("Nothing to change.");
  return { ok: true, patch };
}

// ── sections ───────────────────────────────────────────────────────────────

export type SectionPatch = { title?: string; practical?: Practical };

export const SECTION_LIMITS = { title: 200, rows: 30, columns: 6, column: 60 } as const;

/**
 * A section edit. `practical` is only accepted when `isPractical` (a question
 * section has no table). Rows 1–30, marks as for a question (0–100 in halves,
 * zero allowed), 1–6 column headings of at most 60 characters.
 */
export function cleanSectionPatch(input: unknown, isPractical: boolean): Clean<SectionPatch> {
  if (!isObject(input)) return fail("Nothing to change.");
  const patch: SectionPatch = {};

  if (input.title !== undefined) {
    if (typeof input.title !== "string") return fail("The section title must be text.");
    const title = input.title.trim();
    if (!title) return fail("The section needs a title.");
    if (title.length > SECTION_LIMITS.title) return fail(`A section title can be at most ${SECTION_LIMITS.title} characters.`);
    patch.title = title;
  }

  if (input.practical !== undefined) {
    if (!isPractical) return fail("Only the practical section has a table.");
    const p = input.practical;
    if (!isObject(p)) return fail("The table is not in the right shape.");
    if (typeof p.rows !== "number" || !Number.isInteger(p.rows) || p.rows < 1 || p.rows > SECTION_LIMITS.rows) {
      return fail(`The table can have 1 to ${SECTION_LIMITS.rows} rows.`);
    }
    if (typeof p.marks !== "number" || !isHalfStep(p.marks) || p.marks < 0 || p.marks > 100) {
      return fail("The table's marks must be between 0 and 100, in halves.");
    }
    if (!Array.isArray(p.columns) || !p.columns.every((c) => typeof c === "string")) {
      return fail("The column headings must be text.");
    }
    const columns = (p.columns as string[]).map((c) => c.trim());
    if (columns.length < 1 || columns.length > SECTION_LIMITS.columns) {
      return fail(`The table can have 1 to ${SECTION_LIMITS.columns} columns.`);
    }
    if (columns.some((c) => !c)) return fail("Every column needs a heading.");
    if (columns.some((c) => c.length > SECTION_LIMITS.column)) {
      return fail(`A column heading can be at most ${SECTION_LIMITS.column} characters.`);
    }
    patch.practical = { rows: p.rows, marks: p.marks, columns };
  }

  if (Object.keys(patch).length === 0) return fail("Nothing to change.");
  return { ok: true, patch };
}

// ── items ──────────────────────────────────────────────────────────────────

export type ItemPatch = Partial<
  Pick<PaperItem, "prompt" | "options" | "select_many" | "answer" | "marks" | "answer_lines" | "prompt_quran" | "prompt_images" | "kind">
>;

export const ITEM_LIMITS = {
  prompt: 4000, answer: 4000, options: 10, option: 500, images: 10, answerLines: 30, marksMin: 0.5, marksMax: 100,
} as const;

/** A picture in the exam-questions bucket: imported (`bank/…`) or uploaded (`new/<profile>/…`). */
const IMAGE_PATH_RE = /^(bank|new)\/[\w\-./]+$/;

export function isImagePath(v: unknown): v is string {
  return typeof v === "string" && IMAGE_PATH_RE.test(v) && !v.split("/").includes("..");
}

function isHalfStep(n: number): boolean {
  return Number.isFinite(n) && Number.isInteger(n * 2);
}

/** Marks a question can carry: 0.5 to 100, in steps of 0.5. */
export function isValidMarks(v: unknown): v is number {
  return typeof v === "number" && isHalfStep(v) && v >= ITEM_LIMITS.marksMin && v <= ITEM_LIMITS.marksMax;
}

function cleanOptions(v: unknown): Clean<McqOption[] | null> {
  if (v === null) return { ok: true, patch: null };
  if (!Array.isArray(v)) return fail("The options are not in the right shape.");
  if (v.length > ITEM_LIMITS.options) return fail(`A question can have at most ${ITEM_LIMITS.options} options.`);
  const out: McqOption[] = [];
  for (const o of v) {
    if (!isObject(o) || typeof o.text !== "string") return fail("The options are not in the right shape.");
    const text = o.text.trim();
    if (text.length > ITEM_LIMITS.option) return fail(`An option can be at most ${ITEM_LIMITS.option} characters.`);
    let image: string | null = null;
    if (o.image !== undefined && o.image !== null) {
      if (!isImagePath(o.image)) return fail("An option's picture is not one of ours.");
      image = o.image;
    }
    if (o.correct !== undefined && typeof o.correct !== "boolean") return fail("The options are not in the right shape.");
    out.push({ text, image, correct: o.correct === true });
  }
  return { ok: true, patch: out };
}

/**
 * An edit to a question on a paper. Prompt: non-empty, at most 4000
 * characters. Answer: blank → null. Marks: 0.5–100 in halves. Answer lines:
 * whole, 0–30. Options: at most 10, each at most 500 characters, pictures from
 * our bucket. Typeset ayah: surah 1–114, from ≤ to. Pictures: `bank/…` or
 * `new/…` paths, at most 10.
 */
export function cleanItemPatch(input: unknown): Clean<ItemPatch> {
  if (!isObject(input)) return fail("Nothing to change.");
  const patch: ItemPatch = {};

  if (input.kind !== undefined) {
    if (input.kind !== "mcq" && input.kind !== "short") return fail("A question is multiple choice or short answer.");
    patch.kind = input.kind;
  }

  if (input.prompt !== undefined) {
    if (typeof input.prompt !== "string") return fail("The question must be text.");
    const prompt = input.prompt.trim();
    if (!prompt) return fail("The question can't be empty.");
    if (prompt.length > ITEM_LIMITS.prompt) return fail(`The question can be at most ${ITEM_LIMITS.prompt} characters.`);
    patch.prompt = prompt;
  }

  if (input.answer !== undefined) {
    if (input.answer !== null && typeof input.answer !== "string") return fail("The answer must be text.");
    const answer = input.answer === null ? "" : input.answer.trim();
    if (answer.length > ITEM_LIMITS.answer) return fail(`The answer can be at most ${ITEM_LIMITS.answer} characters.`);
    patch.answer = answer || null;
  }

  if (input.marks !== undefined) {
    if (!isValidMarks(input.marks)) return fail("Marks must be between 0.5 and 100, in halves.");
    patch.marks = input.marks;
  }

  if (input.answer_lines !== undefined) {
    const n = input.answer_lines;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > ITEM_LIMITS.answerLines) {
      return fail(`Answer lines must be a whole number from 0 to ${ITEM_LIMITS.answerLines}.`);
    }
    patch.answer_lines = n;
  }

  if (input.select_many !== undefined) {
    if (typeof input.select_many !== "boolean") return fail("“Select all that apply” is a yes or no.");
    patch.select_many = input.select_many;
  }

  if (input.options !== undefined) {
    const options = cleanOptions(input.options);
    if (!options.ok) return options;
    patch.options = options.patch;
  }

  if (input.prompt_quran !== undefined) {
    if (input.prompt_quran === null) patch.prompt_quran = null;
    else {
      const ref: QuranRef | null = parseQuranRef(input.prompt_quran);
      if (!ref) return fail("Pick a surah from 1 to 114 and an ayah range that runs forwards.");
      patch.prompt_quran = ref;
    }
  }

  if (input.prompt_images !== undefined) {
    const imgs = input.prompt_images;
    if (!Array.isArray(imgs) || !imgs.every(isImagePath)) return fail("A picture is not one of ours.");
    if (imgs.length > ITEM_LIMITS.images) return fail(`A question can have at most ${ITEM_LIMITS.images} pictures.`);
    patch.prompt_images = [...imgs];
  }

  if (Object.keys(patch).length === 0) return fail("Nothing to change.");
  return { ok: true, patch };
}

/**
 * Writing lines under a question as it is first placed: none for a multiple
 * choice, otherwise two per mark, at least 2 and at most 10.
 */
export function answerLinesFor(kind: QuestionKind, marks: number): number {
  if (kind === "mcq") return 0;
  const n = Math.round(2 * (Number.isFinite(marks) ? marks : 1));
  return Math.min(10, Math.max(2, n));
}

// ── ordering ───────────────────────────────────────────────────────────────

type Positioned = { id: string; position: number };

/**
 * The rows in position order with `id` swapped one place up or down, or null
 * when it is not there or already at that end.
 */
export function moved<T extends Positioned>(rows: T[], id: string, dir: "up" | "down"): T[] | null {
  const list = [...rows].sort((a, b) => a.position - b.position);
  const i = list.findIndex((r) => r.id === id);
  if (i < 0) return null;
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= list.length) return null;
  [list[i], list[j]] = [list[j], list[i]];
  return list;
}

/**
 * The position writes that make `ordered` read 1..n: only the rows whose
 * position is not already right.
 */
export function renumbered(ordered: Positioned[]): Positioned[] {
  return ordered.flatMap((r, i) => (r.position === i + 1 ? [] : [{ id: r.id, position: i + 1 }]));
}
