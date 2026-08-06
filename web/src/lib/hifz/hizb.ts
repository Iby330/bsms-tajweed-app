/**
 * Hizb + juz structure for the BSMS memorisation run (An-Nas 114 → Al-Jinn 72).
 *
 * Boundaries follow the standard mushaf division: hizb 60 starts at Al-A'la
 * (87), 59 at An-Naba (78), 58 at Al-Jinn (72) — so the run is exactly hizbs
 * 60+59+58 and ends on a hizb boundary. The hizb check itself is NOT recorded
 * in the DB; everything here is derived from passed surahs, so the UI says
 * "ready for your check", never "check passed" (a hizb_checks table is the
 * future teacher-side hook).
 */
import type { Surah } from "./pace";

export type HizbRange = { hizb: number; from: number; to: number };

/** Surah-number ranges, in memorisation order (hizb 60 first). */
export const HIZB_BOUNDS: HizbRange[] = [
  { hizb: 60, from: 87, to: 114 },
  { hizb: 59, from: 78, to: 86 },
  { hizb: 58, from: 72, to: 77 },
  { hizb: 57, from: 67, to: 71 },
];

export const JUZ_BOUNDS = [
  { juz: 30, from: 78, to: 114, name_en: "Juz 'Amma", name_ar: "عمّ" },
  { juz: 29, from: 67, to: 77, name_en: "Juz Tabarak", name_ar: "تبارك" },
] as const;

export const hizbOf = (n: number): number | null =>
  HIZB_BOUNDS.find((h) => n >= h.from && n <= h.to)?.hizb ?? null;

export const juzOf = (n: number): number | null =>
  JUZ_BOUNDS.find((j) => n >= j.from && n <= j.to)?.juz ?? null;

/**
 * Records only exist from the student's start_surah onward. A returning
 * student's earlier surahs (done in a previous year) count as passed for
 * every derived number on this page.
 */
export function assumedPassed(
  allSurahs: Surah[],
  list: Surah[],
  passed: Set<number>,
): Set<number> {
  const out = new Set(passed);
  if (list.length === 0) return out;
  const startIdx = list[0].order_index;
  for (const s of allSurahs) if (s.order_index < startIdx) out.add(s.number);
  return out;
}
