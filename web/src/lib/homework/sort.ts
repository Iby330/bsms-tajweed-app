/**
 * Ordering the marked-homework list.
 *
 * Progress lists every mark in teaching order, newest first. That answers
 * "what did I just get back" and nothing else — a student who wants to know
 * where they are weakest has to scan twenty-odd rows and hold the numbers in
 * their head. These four orderings answer that directly.
 *
 * Sorting is always WITHIN a term. Term 1 and Term 3 are different courses sat
 * months apart, so a mark only means something next to the others from its own
 * term; a single flat league table across the year would invite a comparison
 * that isn't there.
 *
 * Pure, so the ordering rules can be tested without a database or a browser.
 * `ScoredHomework.pct` is the approved percentage from `v_hw_pct`; it is null
 * for work that is marked but carries no mark — an ungraded homework, or one
 * the view has no row for. That case drives the sharpest rule below.
 */

import type { HomeworkEntry } from "@/lib/curriculum/tree";

export type ScoredHomework = {
  entry: HomeworkEntry;
  /** Approved percentage, or null when this homework carries no mark. */
  pct: number | null;
};

export const HOMEWORK_SORTS = ["latest", "oldest", "highest", "lowest"] as const;
export type HomeworkSort = (typeof HOMEWORK_SORTS)[number];

/** One term's marks, already in the requested order. */
export type SortedTerm = { termId: number; rows: ScoredHomework[] };

/**
 * A usable mark, or null. A malformed view row can reach us as NaN, which must
 * behave exactly like "no mark" rather than poisoning every comparison it
 * touches (`NaN < x` and `NaN > x` are both false, which quietly scrambles a
 * sort instead of failing).
 */
function scoreOf(pct: number | null | undefined): number | null {
  return typeof pct === "number" && Number.isFinite(pct) ? pct : null;
}

/** Teaching order: earliest week first. A term running two courses can put two
 *  homeworks in the same week, so the homework number breaks the tie. */
const byWeek = (a: ScoredHomework, b: ScoredHomework) =>
  a.entry.weekNumber - b.entry.weekNumber ||
  a.entry.homework.number - b.entry.homework.number;

function compare(sort: HomeworkSort) {
  const newestFirst = (a: ScoredHomework, b: ScoredHomework) => byWeek(b, a);

  return (a: ScoredHomework, b: ScoredHomework): number => {
    if (sort === "oldest") return byWeek(a, b);
    if (sort === "latest") return newestFirst(a, b);

    const x = scoreOf(a.pct);
    const y = scoreOf(b.pct);

    // Unmarked work sinks to the bottom of BOTH score sorts. Scoring it zero
    // would head the "lowest first" list with work nobody ever marked, burying
    // the real weak spots the student came here to find.
    if (x === null || y === null) {
      return (x === null ? 1 : 0) - (y === null ? 1 : 0) || newestFirst(a, b);
    }
    // Equal marks fall back to the default order, so the list is never
    // arbitrary and never shuffles between renders.
    return (sort === "highest" ? y - x : x - y) || newestFirst(a, b);
  };
}

export function sortHomework(rows: ScoredHomework[], sort: HomeworkSort): SortedTerm[] {
  const byTerm = new Map<number, ScoredHomework[]>();
  for (const r of rows) {
    const list = byTerm.get(r.entry.termId);
    if (list) list.push(r);
    else byTerm.set(r.entry.termId, [r]);
  }

  // "Oldest" reads as one chronology running from the start of the year, so it
  // turns the term stack over too. A score sort is a within-term comparison,
  // so it leaves the stack alone — most recent term still on top — and only
  // reorders inside each one.
  const termIds = [...byTerm.keys()].sort((a, b) => (sort === "oldest" ? a - b : b - a));

  return termIds.map((termId) => ({
    termId,
    rows: [...byTerm.get(termId)!].sort(compare(sort)),
  }));
}
