import type { TermProgress } from "@/lib/dashboard/queries";

/**
 * Term bar composition — pure, no DOM.
 *
 * A term mark is 80% exam + 20% homework. The bar shows those two
 * contributions stacked, so "why is my term mark that" is answerable by
 * looking rather than by being told the formula.
 */
export const EXAM_WEIGHT = 80;
export const HW_WEIGHT = 20;

export type TermBar = {
  termId: number;
  /** 0–80, the exam's contribution. Null until the exam is sat. */
  examPart: number | null;
  /** 0–20, homework's contribution. Null while nothing is marked. */
  hwPart: number | null;
  /** examPart + hwPart, counting only the parts that exist. */
  total: number;
  /** The database's own term %, echoed for the label. Null while incomplete. */
  termPct: number | null;
};

export function termBar(t: TermProgress): TermBar {
  const examPart =
    t.examScore === null || !t.examMax ? null : (t.examScore / t.examMax) * EXAM_WEIGHT;
  const hwPart = t.hwAvg === null ? null : (t.hwAvg / 100) * HW_WEIGHT;
  return {
    termId: t.termId,
    examPart,
    hwPart,
    total: (examPart ?? 0) + (hwPart ?? 0),
    termPct: t.termPct,
  };
}
