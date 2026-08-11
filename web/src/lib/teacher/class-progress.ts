/**
 * The teacher dashboard's per-student class list — pure logic.
 *
 * Modelled on lib/homework/sort.ts: the shaping and ordering rules live here,
 * with no database and no React, so they can be tested without either.
 */

import { memorisationList, type PaceStatus, type Surah } from "@/lib/hifz/pace";

/**
 * The surah a student is on: the FURTHEST-ALONG surah in their own run that
 * carries a record.
 *
 * Not the most recently dated one. Sign-offs can land out of order, and
 * furthest-along is the definition that stays consistent with the
 * `passed/target` count rendered beside it — a row reading "Al-Fajr" next to a
 * count of 12 would be a contradiction the teacher cannot resolve.
 *
 * Scoped to `memorisationList`, so a returning student whose `start_surah`
 * isn't 114 is never credited with (or judged against) last year's surahs.
 */
export function lastPassedSurah(
  startSurah: number,
  target: number,
  surahs: Surah[],
  passedNumbers: Set<number>,
): Surah | null {
  const list = memorisationList(startSurah, target, surahs);
  for (let i = list.length - 1; i >= 0; i--) {
    if (passedNumbers.has(list[i].number)) return list[i];
  }
  return null;
}

/** One student's line on the dashboard. Every number here came from a view. */
export type ClassRow = {
  studentId: string;
  name: string;
  /** English name of the last surah passed; null when nothing is passed. */
  lastPassed: string | null;
  passed: number;
  target: number;
  expected: number;
  /** null when the student has no hifz profile — no target to judge against. */
  pace: PaceStatus | null;
  /** null when no homework has been marked this term. */
  hwAvg: number | null;
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
