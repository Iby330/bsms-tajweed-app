/**
 * Target-setting vocabulary: teachers pick targets as whole hizbs or an end
 * surah; the database stores a surah count (`hifz_profiles.target_count`).
 * These are the conversions, derived from the same HIZB_BOUNDS the student
 * page renders — pure, so both forms and the server actions share one set of
 * numbers.
 */
import { HIZB_BOUNDS } from "./hizb";
import type { Surah } from "./pace";

export type TargetPreset = {
  hizb: number;
  /** Last surah of the preset in memorisation order (the hizb's lowest number). */
  endSurah: number;
  /** target_count this preset resolves to, counted from the given start. */
  count: number;
  label: string;
};

const inOrder = (surahs: Surah[]) =>
  [...surahs].sort((a, b) => a.order_index - b.order_index);

/**
 * Surahs from `startSurah` to `endSurah` inclusive, walking memorisation
 * order. Null when either surah is outside the run or the end precedes the
 * start — a target can't be negative, and a silent 0 would erase a profile.
 */
export function countTo(
  startSurah: number,
  endSurah: number,
  surahs: Surah[],
): number | null {
  const ordered = inOrder(surahs);
  const from = ordered.findIndex((s) => s.number === startSurah);
  const to = ordered.findIndex((s) => s.number === endSurah);
  if (from === -1 || to === -1 || to < from) return null;
  return to - from + 1;
}

export type TargetPlan = { studentId: string; startSurah: number; count: number };

/**
 * One end surah across a selection, a count per student. Each student's
 * target derives from their OWN start, so a returning student gets a shorter
 * run to the same goal. A student whose start is already past the end (or
 * unknown) is skipped — applying a goal must never move anyone backwards.
 */
export function planTargets(
  students: { studentId: string; startSurah: number }[],
  endSurah: number,
  surahs: Surah[],
): { plans: TargetPlan[]; skipped: string[] } {
  const plans: TargetPlan[] = [];
  const skipped: string[] = [];
  for (const s of students) {
    const count = countTo(s.startSurah, endSurah, surahs);
    if (count === null) skipped.push(s.studentId);
    else plans.push({ studentId: s.studentId, startSurah: s.startSurah, count });
  }
  return { plans, skipped };
}

/**
 * The preset options for a student starting at `startSurah`: one per hizb
 * boundary at or after the start, each carrying the target_count it resolves
 * to. Hizb 57 never appears — its surahs aren't seeded, so its end surah is
 * missing from the list and the preset drops out with it.
 */
export function targetPresets(startSurah: number, surahs: Surah[]): TargetPreset[] {
  return HIZB_BOUNDS.flatMap(({ hizb, from }) => {
    // `from` is the hizb's lowest surah number — its last surah in
    // memorisation order, i.e. where this preset ends.
    const count = countTo(startSurah, from, surahs);
    if (count === null) return [];
    return [{ hizb, endSurah: from, count, label: `To end of Hizb ${hizb}` }];
  });
}
