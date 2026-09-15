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
 * Which of THIS YEAR'S list a student has actually passed.
 *
 * `hifz_records` is lifetime — it has no year column — while the list is one
 * year's target. A returning student therefore carries more records than the
 * list has entries, and the two numbers must not be confused:
 *
 *   · counting the records answers "how many surahs do they know", and for
 *     Adam Whitfield that is 26 against a target of 15, which is why the
 *     hifdh leaderboard has him at 173%.
 *   · counting the intersection answers "how far through this year are they",
 *     which is what a card about this year's target is asking.
 *
 * Home used to take the first number and index the list with it —
 * `list[passed - 1]` — which is wrong twice over. Past the end of the list it
 * is `undefined`, and the surah name simply vanishes off the card. Inside it,
 * it names the wrong surah for anyone who passed anything out of order, since
 * indexing by a count assumes the passed ones are an unbroken run from the
 * top. `/hifz` has always done it this way; this is that logic, shared.
 *
 * `last` is the furthest along the list, not the most recent by date — the
 * list is the order the programme intends, so it is the one that answers
 * "where have you got to".
 */
export function passedOfList(
  list: Surah[],
  passedSurahNumbers: Iterable<number>,
): { count: number; last: Surah | null; isPassed: (surah: number) => boolean } {
  const passed = new Set(passedSurahNumbers);
  const mine = list.filter((s) => passed.has(s.number));
  return {
    count: mine.length,
    last: mine.length ? mine[mine.length - 1] : null,
    isPassed: (surah: number) => passed.has(surah),
  };
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
