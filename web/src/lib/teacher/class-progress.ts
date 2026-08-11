/**
 * The teacher dashboard's per-student class list — pure logic.
 *
 * Modelled on lib/homework/sort.ts: the shaping and ordering rules live here,
 * with no database and no React, so they can be tested without either.
 */

import { memorisationList, type Surah } from "@/lib/hifz/pace";

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
