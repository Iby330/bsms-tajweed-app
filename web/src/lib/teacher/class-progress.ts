/**
 * The teacher dashboard's per-student class list — pure logic.
 *
 * Modelled on lib/homework/sort.ts: the shaping and ordering rules live here,
 * with no database and no React, so they can be tested without either.
 */

import { type PaceStatus, type Surah } from "@/lib/hifz/pace";

/**
 * The surah a student is ON: the first one in their own run that has NOT been
 * signed off.
 *
 * Not the furthest one already passed. Sign-offs land out of order, so a
 * student credited with An-Nas and Al-Masad is still working on Al-Falaq in
 * between — naming the deepest record would tell the teacher a surah nobody
 * is reciting on Thursday. Same definition the hifz register uses for "next".
 *
 * Takes the student's OWN run (see `memorisationList`), so a returning
 * student whose `start_surah` isn't 114 is never credited with, or judged
 * against, last year's surahs. Null once the whole target is passed — there
 * is nothing left to be on.
 */
export function currentSurah(run: Surah[], passedNumbers: Set<number>): Surah | null {
  return run.find((s) => !passedNumbers.has(s.number)) ?? null;
}

/**
 * The surah the calendar says a student should be on today, given how many it
 * expects them to have PASSED by now.
 *
 * `expected` surahs finished means the next one — index `expected`, since the
 * run is zero-based — is the one in hand. That is the same thing
 * `currentSurah` reports, so the two positions sit side by side on a row and
 * the gap between them is the whole story.
 */
export function expectedSurah(run: Surah[], expected: number): Surah | null {
  if (!run.length) return null;
  return run[Math.min(expected, run.length - 1)];
}

/** Where a student stands in the 43, as one readable unit. */
export type SurahMark = {
  nameEn: string;
  nameAr: string;
  /** Place in the programme: 1 = An-Nas … 43 = Al-Jinn. */
  index: number;
};

/** One student's line on the dashboard. Every number here came from a view. */
export type ClassRow = {
  studentId: string;
  name: string;
  /** The surah being memorised now. Null with no target, or once it's done. */
  surah: SurahMark | null;
  /** Where the calendar puts them today, on the same 1..43 scale. */
  expectedIndex: number | null;
  /** Length of the programme — the "43" both positions are out of. */
  outOf: number;
  /** null when the student has no hifz profile — no target to judge against. */
  pace: PaceStatus | null;
  /** null when no homework has been marked this term. */
  hwAvg: number | null;
  /** Share of the year's hifz target signed off. Straight from the view. */
  hifzAvg: number | null;
};

export const CLASS_SORTS = ["attention", "name", "lowest-hw"] as const;
export type ClassSort = (typeof CLASS_SORTS)[number];

const PACE_RANK: Record<PaceStatus, number> = { danger: 0, warn: 1, ok: 2 };

/** No profile ranks below every real status: a missing target is a data gap,
 *  not a struggling student, and shouldn't head a "needs attention" list. */
const paceRank = (pace: PaceStatus | null) => (pace === null ? 3 : PACE_RANK[pace]);

/**
 * A usable average, or null. A malformed view row can reach us as NaN, which
 * must behave exactly like "no mark" rather than poisoning every comparison it
 * touches (`NaN < x` and `NaN > x` are both false, which quietly scrambles a
 * sort instead of failing).
 */
const scoreOf = (pct: number | null): number | null =>
  typeof pct === "number" && Number.isFinite(pct) ? pct : null;

/** Every ordering ends here, so the list is never arbitrary and never
 *  shuffles between renders. */
const byName = (a: ClassRow, b: ClassRow) => a.name.localeCompare(b.name);

export function sortClassRows(rows: ClassRow[], sort: ClassSort): ClassRow[] {
  const out = [...rows];

  if (sort === "name") return out.sort(byName);

  if (sort === "attention") {
    return out.sort((a, b) => paceRank(a.pace) - paceRank(b.pace) || byName(a, b));
  }

  return out.sort((a, b) => {
    const x = scoreOf(a.hwAvg);
    const y = scoreOf(b.hwAvg);
    // Unmarked work sinks to the bottom. Scoring it zero would head the list
    // with a student nobody has marked, burying the real weak spots.
    if (x === null || y === null) {
      return (x === null ? 1 : 0) - (y === null ? 1 : 0) || byName(a, b);
    }
    return x - y || byName(a, b);
  });
}
