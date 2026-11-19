/**
 * Narrowing the exam-builder rows the database hands back to the shapes in
 * types.ts. The jsonb columns (`options`, `prompt_quran`, `sources`,
 * `practical`) are typed `Json` by the generator and could hold anything an
 * import or a hand edit put there, so nothing is trusted: a malformed value
 * falls back to the empty shape (`null` or `[]`) rather than reaching a
 * component that would crash on it.
 *
 * Pure and IO-free, so the loaders, the actions and the tests share it.
 */
import type { Database } from "@/lib/database.types";
import type {
  BankQuestion, McqOption, Paper, PaperItem, PaperStatus, Practical, QuestionKind, QuranRef,
  ReviewStatus, Section, SectionKind, SourceRef,
} from "./types";

type Tables = Database["public"]["Tables"];
export type BankRow = Tables["exam_bank_questions"]["Row"];
export type PaperRow = Tables["exam_papers"]["Row"];
export type SectionRow = Tables["exam_paper_sections"]["Row"];
export type ItemRow = Tables["exam_paper_items"]["Row"];

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isPosInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1;

/** "mcq" | "short"; anything else is read as a short answer. */
export function parseKind(v: unknown): QuestionKind {
  return v === "mcq" ? "mcq" : "short";
}

export function parseReviewStatus(v: unknown): ReviewStatus {
  return v === "check" || v === "approved" ? v : "clean";
}

export function parsePaperStatus(v: unknown): PaperStatus {
  return v === "final" ? "final" : "draft";
}

export function parseSectionKind(v: unknown): SectionKind {
  return v === "practical" ? "practical" : "questions";
}

/**
 * `[{text, image, correct}]`, or null. An option may leave out `image` (→ null)
 * and `correct` (→ false), and a picture-only option may leave out `text`
 * (→ ""). Anything else wrong in any option, or a value that is not an array,
 * makes the whole list null: half a list of options is not a question.
 */
export function parseOptions(v: unknown): McqOption[] | null {
  if (!Array.isArray(v)) return null;
  const out: McqOption[] = [];
  for (const o of v) {
    if (!isObject(o)) return null;
    let image: string | null = null;
    if (o.image !== undefined && o.image !== null) {
      if (typeof o.image !== "string") return null;
      image = o.image;
    }
    let text: string;
    if (typeof o.text === "string") text = o.text;
    else if (o.text === undefined && image !== null) text = "";
    else return null;
    if (o.correct !== undefined && typeof o.correct !== "boolean") return null;
    out.push({ text, image, correct: o.correct === true });
  }
  return out;
}

/**
 * `{surah, from_ayah, to_ayah, from_word?, to_word?}` with surah 1–114 and a
 * forward range, or null.
 */
export function parseQuranRef(v: unknown): QuranRef | null {
  if (!isObject(v)) return null;
  const { surah, from_ayah, to_ayah, from_word, to_word } = v;
  if (!isPosInt(surah) || surah > 114) return null;
  if (!isPosInt(from_ayah) || !isPosInt(to_ayah) || from_ayah > to_ayah) return null;
  const ref: QuranRef = { surah, from_ayah, to_ayah };
  if (from_word !== undefined && from_word !== null) {
    if (!isPosInt(from_word)) return null;
    ref.from_word = from_word;
  }
  if (to_word !== undefined && to_word !== null) {
    if (!isPosInt(to_word)) return null;
    ref.to_word = to_word;
  }
  return ref;
}

const SOURCE_KINDS: readonly SourceRef["kind"][] = ["exam", "bank", "mark_scheme", "form"];

/**
 * Where a bank question was found. Not an array → `[]`; an entry without a
 * label or with an unknown kind is dropped, the rest kept.
 */
export function parseSources(v: unknown): SourceRef[] {
  if (!Array.isArray(v)) return [];
  const out: SourceRef[] = [];
  for (const s of v) {
    if (!isObject(s) || typeof s.label !== "string" || !s.label.trim()) continue;
    if (!SOURCE_KINDS.includes(s.kind as SourceRef["kind"])) continue;
    const ref: SourceRef = { label: s.label, kind: s.kind as SourceRef["kind"] };
    if (typeof s.number === "string" && s.number) ref.number = s.number;
    out.push(ref);
  }
  return out;
}

/** `{rows, marks, columns}` for a practical section, or null. */
export function parsePractical(v: unknown): Practical | null {
  if (!isObject(v)) return null;
  const { rows, marks, columns } = v;
  if (typeof rows !== "number" || !Number.isInteger(rows) || rows < 0) return null;
  if (typeof marks !== "number" || !Number.isFinite(marks) || marks < 0) return null;
  if (!Array.isArray(columns) || !columns.every((c) => typeof c === "string")) return null;
  return { rows, marks, columns: [...columns] };
}

/** A string[] column that should never be null but is typed as if it might. */
function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
}

export function toBankQuestion(row: BankRow, imageUrls: Record<string, string> = {}): BankQuestion {
  return {
    ...row,
    kind: parseKind(row.kind),
    prompt_images: strings(row.prompt_images),
    options: parseOptions(row.options),
    prompt_quran: parseQuranRef(row.prompt_quran),
    sources: parseSources(row.sources),
    used_in: strings(row.used_in),
    review_status: parseReviewStatus(row.review_status),
    imageUrls,
  };
}

export function toPaper(row: PaperRow): Paper {
  return { ...row, notes: strings(row.notes), status: parsePaperStatus(row.status) };
}

export function toSection(row: SectionRow): Section {
  const kind = parseSectionKind(row.kind);
  return { ...row, kind, practical: kind === "practical" ? parsePractical(row.practical) : null };
}

export function toPaperItem(row: ItemRow): PaperItem {
  return {
    ...row,
    kind: parseKind(row.kind),
    prompt_images: strings(row.prompt_images),
    options: parseOptions(row.options),
    prompt_quran: parseQuranRef(row.prompt_quran),
  };
}
