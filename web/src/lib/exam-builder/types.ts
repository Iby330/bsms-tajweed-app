/**
 * Exam Builder shapes. Not the end-of-term MARK feature (`exam_scores`,
 * `lib/exams/`): this is the bank of past questions and the papers built from
 * it. Rows come from migration 0152; the jsonb and check-constrained text
 * columns are narrowed here to what the migration allows.
 *
 * Marks are `numeric(4,1)` in Postgres and arrive from PostgREST as plain
 * numbers, halves included (1.5).
 */
import type { Database } from "@/lib/database.types";

type Tables = Database["public"]["Tables"];

export type QuestionKind = "mcq" | "short";
export type ReviewStatus = "clean" | "check" | "approved";
export type PaperStatus = "draft" | "final";
export type SectionKind = "questions" | "practical";

/** One multiple-choice option. `image` is a path in the exam-questions bucket. */
export type McqOption = { text: string; image: string | null; correct: boolean };

/** An ayah range to typeset from `quran_words` instead of a picture. */
export type QuranRef = {
  surah: number;
  from_ayah: number;
  to_ayah: number;
  from_word?: number;
  to_word?: number;
};

/** One place a bank question was found: `{label: "EOT2 25/26", kind: "exam", number: "A12"}`. */
export type SourceRef = {
  label: string;
  kind: "exam" | "bank" | "mark_scheme" | "form";
  number?: string;
};

/** The hifdh marking table of a practical section. */
export type Practical = { rows: number; marks: number; columns: string[] };

/** `{id: "sifaat.ra", parent_id: "sifaat", title: "Ra", position: 43}` */
export type Topic = Tables["exam_bank_topics"]["Row"];

/** A top-level topic and its rules. A standalone subject has `children: []`. */
export type TopicGroup = { topic: Topic; children: Topic[] };

type BankRow = Tables["exam_bank_questions"]["Row"];

/** A bank question, with its pictures' signed URLs keyed by storage path. */
export type BankQuestion = Omit<BankRow, "kind" | "options" | "prompt_quran" | "sources" | "review_status"> & {
  kind: QuestionKind;
  options: McqOption[] | null;
  prompt_quran: QuranRef | null;
  sources: SourceRef[];
  review_status: ReviewStatus;
  /** storage path → signed URL, for prompt_images and option images */
  imageUrls: Record<string, string>;
};

export type Paper = Omit<Tables["exam_papers"]["Row"], "status"> & { status: PaperStatus };

export type Section = Omit<Tables["exam_paper_sections"]["Row"], "kind" | "practical"> & {
  kind: SectionKind;
  practical: Practical | null;
};

/** A question on a paper: a full copy, edited without touching the bank. */
export type PaperItem = Omit<Tables["exam_paper_items"]["Row"], "kind" | "options" | "prompt_quran"> & {
  kind: QuestionKind;
  options: McqOption[] | null;
  prompt_quran: QuranRef | null;
};

/**
 * What every exam-builder server action returns. Extra success fields ride on
 * the `ok: true` arm: `Result<{ id: string }>`.
 */
export type Result<T extends object = Record<never, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };
