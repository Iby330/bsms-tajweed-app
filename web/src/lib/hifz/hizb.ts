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
  // 57 is mapped so hizbOf/juzOf answer honestly for Tabarak surahs outside the
  // programme. It must never yield a block: `surahs` is seeded 72–114 only.
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

export type HizbBlockState = "complete" | "current" | "upcoming";
export type HizbBlock = {
  hizb: number;
  surahs: Surah[]; // run order
  passedCount: number;
  state: HizbBlockState;
};

/** Blocks over the FULL run — the hero bars show all of them regardless of
 *  the student's yearly target. Pass the `assumedPassed` set. */
export function hizbBlocks(allSurahs: Surah[], passed: Set<number>): HizbBlock[] {
  const ordered = [...allSurahs].sort((a, b) => a.order_index - b.order_index);
  const groups = new Map<number, Surah[]>();
  for (const s of ordered) {
    const h = hizbOf(s.number);
    if (h === null) continue;
    groups.set(h, [...(groups.get(h) ?? []), s]);
  }
  const blocks: HizbBlock[] = [...groups.entries()].map(([hizb, surahs]) => ({
    hizb,
    surahs,
    passedCount: surahs.filter((s) => passed.has(s.number)).length,
    state: "upcoming",
  }));
  let currentSeen = false;
  for (const b of blocks) {
    if (b.passedCount === b.surahs.length) b.state = "complete";
    else if (!currentSeen) {
      b.state = "current";
      currentSeen = true;
    }
  }
  return blocks;
}

export type CheckStatus =
  | { kind: "toGo"; hizb: number; remaining: number }
  | { kind: "ready"; hizb: number }
  | { kind: "done" }
  | null;

/** The hero's footer line. "ready" = block finished but its check not yet
 *  presumed done (the next block is untouched). Pass `earned` (this year's
 *  real records, NOT the assumed set) so a returning student who passed the
 *  previous hizb's check last year isn't told to present it again.
 *  Derived, never authoritative. */
export function checkStatus(blocks: HizbBlock[], earned?: Set<number>): CheckStatus {
  if (blocks.length === 0) return null;
  if (blocks.every((b) => b.state === "complete")) return { kind: "done" };
  const curIdx = blocks.findIndex((b) => b.state === "current");
  if (curIdx === -1) return null;
  const cur = blocks[curIdx];
  const prev = blocks[curIdx - 1];
  const earnedPrev = !earned || (prev?.surahs.some((s) => earned.has(s.number)) ?? false);
  if (cur.passedCount === 0 && prev?.state === "complete" && earnedPrev)
    return { kind: "ready", hizb: prev.hizb };
  return { kind: "toGo", hizb: cur.hizb, remaining: cur.surahs.length - cur.passedCount };
}

export type JuzProgress = {
  juz: number;
  name_en: string;
  name_ar: string;
  passed: number;
  total: number;
};

/** Progress through the juz the current surah sits in. Denominator = that
 *  juz's surahs within the run (37 for 'Amma; 6 for Tabarak, since hizb 57
 *  is outside the programme). Pass the `assumedPassed` set. */
export function juzProgress(
  allSurahs: Surah[],
  list: Surah[],
  passed: Set<number>,
): JuzProgress | null {
  if (list.length === 0) return null;
  const current = list.find((s) => !passed.has(s.number)) ?? list[list.length - 1];
  const juz = juzOf(current.number);
  if (juz === null) return null;
  const bound = JUZ_BOUNDS.find((j) => j.juz === juz)!;
  const inJuz = allSurahs.filter((s) => s.number >= bound.from && s.number <= bound.to);
  return {
    juz,
    name_en: bound.name_en,
    name_ar: bound.name_ar,
    passed: inJuz.filter((s) => passed.has(s.number)).length,
    total: inJuz.length,
  };
}

export type PathRow = { kind: "node"; index: number } | { kind: "gap"; count: number };

/** Which of `count` rows to render: kept rows as nodes, contiguous hidden
 *  runs of 3+ collapsed to a "… N more surahs" gap row. */
export function rowPlan(count: number, keep: Set<number>): PathRow[] {
  const rows: PathRow[] = [];
  let i = 0;
  while (i < count) {
    if (keep.has(i)) {
      rows.push({ kind: "node", index: i });
      i++;
      continue;
    }
    let j = i;
    while (j < count && !keep.has(j)) j++;
    if (j - i >= 3) rows.push({ kind: "gap", count: j - i });
    else for (let k = i; k < j; k++) rows.push({ kind: "node", index: k });
    i = j;
  }
  return rows;
}
