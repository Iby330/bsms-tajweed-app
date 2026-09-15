/**
 * Hifz pacing — pure functions.
 *
 * Memorisation runs An-Nas (114) first down to Al-Jinn (72): surahs.order_index
 * 1..43. Expected progress is derived from the teaching calendar (terms are NOT
 * equal length, so dividing by three would be wrong) and always ROUNDS UP —
 * a student is never "2.4 surahs" behind, per the programme's own rule.
 */

export type Week = { unlock_at: string };
export type PaceStatus = "ok" | "warn" | "danger";

/**
 * How many surahs a student should have passed by `now`.
 * Fraction of teaching weeks elapsed × target, rounded UP, clamped to target.
 */
export function expectedPassed(
  now: Date,
  weeks: Week[],
  targetCount: number,
): number {
  if (targetCount <= 0 || weeks.length === 0) return 0;
  const elapsed = weeks.filter((w) => Date.parse(w.unlock_at) <= now.getTime()).length;
  if (elapsed === 0) return 0;
  const fraction = elapsed / weeks.length;
  return Math.min(targetCount, Math.ceil(fraction * targetCount));
}

/** Above expected → ok · exactly on → warn · behind → danger. */
export function paceStatus(passed: number, expected: number): PaceStatus {
  if (passed > expected) return "ok";
  if (passed === expected) return "warn";
  return "danger";
}

export type Surah = {
  number: number;
  order_index: number;
  name_ar: string;
  name_en: string;
};

/**
 * How far past the START of this year's list a student has got.
 *
 * `hifz_records` is lifetime — it has no year column — so the raw count says
 * how many surahs a student knows, not how much of this year they have done.
 * The two differ in both directions, and the list's FIRST entry is what
 * separates them:
 *
 *   · Anything before it belongs to an earlier year. A returning student
 *     starting at Al-A'la has 26 passes behind that point; none of them is
 *     this year's work, and counting them would open their year at 173%.
 *   · Anything at or after it is this year's work, INCLUDING the surahs that
 *     run past the target. A student who has done 45 of a 43-surah year has
 *     not made an error, they are two ahead — so the count is 45 and the
 *     surah named is the 45th, not the 43rd. Capping it there would tell
 *     them they are somewhere they left two surahs ago.
 *
 * Which is why this takes the whole ordered list of surahs and not just the
 * year's slice: the slice cannot name a surah beyond its own end.
 *
 * `last` is the furthest along the memorisation order, not the most recent by
 * date — the order is the one the programme intends, so it is the one that
 * answers "where have you got to".
 */
export function passedThisYear(
  allSurahs: Surah[],
  list: Surah[],
  passedSurahNumbers: Iterable<number>,
): { count: number; last: Surah | null; isPassed: (surah: number) => boolean } {
  const passed = new Set(passedSurahNumbers);
  const isPassed = (surah: number) => passed.has(surah);
  if (list.length === 0) return { count: 0, last: null, isPassed };

  const from = list[0].order_index;
  const mine = allSurahs
    .filter((s) => s.order_index >= from && passed.has(s.number))
    .sort((a, b) => a.order_index - b.order_index);

  return { count: mine.length, last: mine.length ? mine[mine.length - 1] : null, isPassed };
}

/**
 * The student's own memorisation list: `targetCount` surahs starting at
 * `startSurah`. Returning students who pass a hifz check start partway down.
 */
export function memorisationList(
  startSurah: number,
  targetCount: number,
  surahs: Surah[],
): Surah[] {
  const ordered = [...surahs].sort((a, b) => a.order_index - b.order_index);
  const startAt = ordered.findIndex((s) => s.number === startSurah);
  const from = startAt === -1 ? 0 : startAt;
  return ordered.slice(from, from + targetCount);
}
