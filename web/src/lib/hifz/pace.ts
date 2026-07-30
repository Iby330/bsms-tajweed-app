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
