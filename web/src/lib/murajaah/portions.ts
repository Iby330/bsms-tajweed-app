/**
 * Portions for murāja'ah: hizb 1–60, juz 1–30, surah 1–114.
 *
 * A session covers one KIND of portion (several hizb, OR several juz, OR
 * several surahs). Pure and client-safe: no server imports, so both the
 * listener screen and the teacher page can use it.
 *
 * Data: `portions.json`, extracted once from the approved prototype. A unit
 * runs from its `start` up to (not including) the next unit's start; hizb 60
 * and juz 30 run to 114:6. Ranges here are INCLUSIVE on both ends.
 */
import data from "./portions.json";

export type PortionKind = "hizb" | "juz" | "surah";
export const PORTION_KINDS: readonly PortionKind[] = ["hizb", "juz", "surah"];
export const PORTION_COUNT: Record<PortionKind, number> = { hizb: 60, juz: 30, surah: 114 };

export type SurahInfo = { n: number; en: string; ar: string; ayahs: number; pages: [number, number] };
export type QuarterInfo = { q: number; start: string; page: number; label: string };
export type HizbInfo = { n: number; juz: number; start: string; page: number; label: string; quarters: QuarterInfo[] };
export type JuzInfo = {
  n: number; start: string; page: number; label: string;
  hizbs: [number, number];
  secondHizb: { start: string; page: number; label: string };
};
export type PortionsData = { surahs: SurahInfo[]; juzs: JuzInfo[]; hizbs: HizbInfo[] };

export const PORTIONS = data as unknown as PortionsData;

/** An ayah. `"surah:ayah"` keys in the data parse to this. */
export type Verse = { surah: number; ayah: number };
/** Inclusive at both ends. */
export type VerseRange = { from: Verse; to: Verse };

export type Unit = {
  kind: PortionKind;
  n: number;
  /** "Hizb 57", "Juz 28", "Al-Mulk". */
  label: string;
  from: Verse;
  to: Verse;
  /** The mushaf page it opens on. */
  page: number;
  /** Size in hizb-equivalents: hizb 1, juz 2, surah pages ÷ 10. */
  hizbEq: number;
};

export function isPortionKind(x: unknown): x is PortionKind {
  return x === "hizb" || x === "juz" || x === "surah";
}

export function parseVerse(key: string): Verse {
  const [s, a] = key.split(":");
  return { surah: Number(s), ayah: Number(a) };
}

export function compareVerse(a: Verse, b: Verse): number {
  return a.surah - b.surah || a.ayah - b.ayah;
}

/** The ayah before this one, across a surah boundary. */
export function verseBefore(v: Verse): Verse {
  if (v.ayah > 1) return { surah: v.surah, ayah: v.ayah - 1 };
  const prev = PORTIONS.surahs[v.surah - 2];
  return { surah: prev.n, ayah: prev.ayahs };
}

const LAST: Verse = { surah: 114, ayah: 6 };

/** Hundredths, so sums of tenths don't come out as 0.30000000000000004. */
export function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

function checkUnit(kind: PortionKind, n: number): void {
  if (!isPortionKind(kind)) throw new RangeError(`Unknown portion kind: ${String(kind)}`);
  if (!Number.isInteger(n) || n < 1 || n > PORTION_COUNT[kind]) {
    throw new RangeError(`No ${kind} ${n}`);
  }
}

export function surahInfo(n: number): SurahInfo {
  checkUnit("surah", n);
  return PORTIONS.surahs[n - 1];
}
export function hizbInfo(n: number): HizbInfo {
  checkUnit("hizb", n);
  return PORTIONS.hizbs[n - 1];
}
export function juzInfo(n: number): JuzInfo {
  checkUnit("juz", n);
  return PORTIONS.juzs[n - 1];
}

/** A surah's size: its page count ÷ 10. */
export function surahHizbEq(n: number): number {
  const s = surahInfo(n);
  return round2((s.pages[1] - s.pages[0] + 1) / 10);
}

/** "Hizb 57", "Juz 28", or the surah's English name. */
export function unitName(kind: PortionKind, n: number): string {
  checkUnit(kind, n);
  if (kind === "hizb") return `Hizb ${n}`;
  if (kind === "juz") return `Juz ${n}`;
  return PORTIONS.surahs[n - 1].en;
}

export function unitOf(kind: PortionKind, n: number): Unit {
  checkUnit(kind, n);
  const label = unitName(kind, n);
  if (kind === "hizb") {
    const h = PORTIONS.hizbs[n - 1];
    const to = n < 60 ? verseBefore(parseVerse(PORTIONS.hizbs[n].start)) : LAST;
    return { kind, n, label, from: parseVerse(h.start), to, page: h.page, hizbEq: 1 };
  }
  if (kind === "juz") {
    const j = PORTIONS.juzs[n - 1];
    const to = n < 30 ? verseBefore(parseVerse(PORTIONS.juzs[n].start)) : LAST;
    return { kind, n, label, from: parseVerse(j.start), to, page: j.page, hizbEq: 2 };
  }
  const s = PORTIONS.surahs[n - 1];
  return {
    kind, n, label,
    from: { surah: n, ayah: 1 }, to: { surah: n, ayah: s.ayahs },
    page: s.pages[0], hizbEq: surahHizbEq(n),
  };
}

/** Sorted, duplicate-free, non-empty and in range, or a RangeError. */
export function normaliseSelection(kind: PortionKind, ns: readonly number[]): number[] {
  if (!isPortionKind(kind)) throw new RangeError(`Unknown portion kind: ${String(kind)}`);
  if (!ns.length) throw new RangeError("Pick at least one portion.");
  for (const n of ns) checkUnit(kind, n);
  return [...new Set(ns)].sort((a, b) => a - b);
}

export function isValidSelection(kind: PortionKind, ns: readonly number[]): boolean {
  try {
    normaliseSelection(kind, ns);
    return true;
  } catch {
    return false;
  }
}

/** Sorted numbers split into consecutive runs: [1,2,5] → [[1,2],[5]]. */
export function runsOf(ns: readonly number[]): number[][] {
  const runs: number[][] = [];
  for (const n of ns) {
    const cur = runs[runs.length - 1];
    if (cur && n === cur[cur.length - 1] + 1) cur.push(n);
    else runs.push([n]);
  }
  return runs;
}

/**
 * "Juz 28 + 30", "Hizb 57–60", "Surah Al-Mulk", "Al-Mulk + Al-Qalam",
 * "Al-Mulk–Al-Mursalat (11 surahs)". Consecutive runs take an en dash,
 * separate runs " + ". Empty for an empty selection.
 */
export function selectionLabel(kind: PortionKind, ns: readonly number[]): string {
  if (!ns.length) return "";
  const sorted = normaliseSelection(kind, ns);
  if (kind === "surah") {
    if (sorted.length === 1) return `Surah ${PORTIONS.surahs[sorted[0] - 1].en}`;
    return runsOf(sorted)
      .map((r) => {
        const a = PORTIONS.surahs[r[0] - 1].en;
        const b = PORTIONS.surahs[r[r.length - 1] - 1].en;
        if (r.length === 1) return a;
        if (r.length === 2) return `${a} + ${b}`;
        return `${a}–${b} (${r.length} surahs)`;
      })
      .join(" + ");
  }
  const head = kind === "hizb" ? "Hizb" : "Juz";
  const body = runsOf(sorted)
    .map((r) => (r.length > 1 ? `${r[0]}–${r[r.length - 1]}` : String(r[0])))
    .join(" + ");
  return `${head} ${body}`;
}

/** The selection's size in hizb-equivalents: the sum of its units. */
export function hizbEqOf(kind: PortionKind, ns: readonly number[]): number {
  return round2(normaliseSelection(kind, ns).reduce((t, n) => t + unitOf(kind, n).hizbEq, 0));
}

/** Inclusive verse ranges, one per consecutive run (used to dim the rest). */
export function rangesOf(kind: PortionKind, ns: readonly number[]): VerseRange[] {
  return runsOf(normaliseSelection(kind, ns)).map((r) => ({
    from: unitOf(kind, r[0]).from,
    to: unitOf(kind, r[r.length - 1]).to,
  }));
}

export function inRanges(ranges: readonly VerseRange[], surah: number, ayah: number): boolean {
  const v = { surah, ayah };
  return ranges.some((r) => compareVerse(v, r.from) >= 0 && compareVerse(v, r.to) <= 0);
}

/** The mushaf page the selection opens on: its lowest unit's. */
export function firstPageOf(kind: PortionKind, ns: readonly number[]): number {
  return unitOf(kind, normaliseSelection(kind, ns)[0]).page;
}
