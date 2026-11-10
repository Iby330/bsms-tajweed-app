/**
 * Targets for murāja'ah: the class's band minutes and mistake limits, and a
 * student's own limits. Pure and client-safe.
 *
 * Mistake limits: hizb 3, juz 5, surah 3 per 10 pages (rounded up, at least
 * 1) by default. A selection sums its units' limits. A per-student override
 * replaces the class value for that kind; a null field keeps the class's.
 */
import { DEFAULT_BAND_MINUTES, type BandMinutes } from "./bands";
import { normaliseSelection, surahInfo, type PortionKind } from "./portions";

export type MistakeLimits = { hizb: number; juz: number; surah10: number };
export const DEFAULT_MISTAKE_LIMITS: MistakeLimits = { hizb: 3, juz: 5, surah10: 3 };

export type ClassTarget = { minutes: BandMinutes; limits: MistakeLimits };
export const DEFAULT_CLASS_TARGET: ClassTarget = {
  minutes: { ...DEFAULT_BAND_MINUTES },
  limits: { ...DEFAULT_MISTAKE_LIMITS },
};

/** A student's own limits; null = the class value. */
export type TargetOverride = {
  hizb: number | null;
  juz: number | null;
  surah10: number | null;
  note?: string | null;
};

/** The columns of a `murajaah_targets` row this needs. */
export type TargetsRowLike = {
  ideal_min: number; good_min: number; acceptable_min: number;
  limit_hizb: number; limit_juz: number; limit_surah10: number;
};
/** The columns of a `murajaah_target_overrides` row this needs. */
export type OverrideRowLike = {
  limit_hizb: number | null; limit_juz: number | null; limit_surah10: number | null;
  note?: string | null;
};

/** A class's target; no row means the defaults. Numeric columns are coerced. */
export function classTargetFromRow(row: TargetsRowLike | null | undefined): ClassTarget {
  if (!row) return { minutes: { ...DEFAULT_BAND_MINUTES }, limits: { ...DEFAULT_MISTAKE_LIMITS } };
  return {
    minutes: { ideal: Number(row.ideal_min), good: Number(row.good_min), acceptable: Number(row.acceptable_min) },
    limits: { hizb: row.limit_hizb, juz: row.limit_juz, surah10: row.limit_surah10 },
  };
}

export function overrideFromRow(row: OverrideRowLike | null | undefined): TargetOverride | null {
  if (!row) return null;
  return { hizb: row.limit_hizb, juz: row.limit_juz, surah10: row.limit_surah10, note: row.note ?? null };
}

export function effectiveLimits(target: ClassTarget, override?: TargetOverride | null): MistakeLimits {
  return {
    hizb: override?.hizb ?? target.limits.hizb,
    juz: override?.juz ?? target.limits.juz,
    surah10: override?.surah10 ?? target.limits.surah10,
  };
}

/** One unit's limit. A surah's is its pages' share of `surah10`, rounded up, at least 1. */
export function unitMistakeLimit(kind: PortionKind, n: number, limits: MistakeLimits): number {
  if (kind === "hizb") return limits.hizb;
  if (kind === "juz") return limits.juz;
  const s = surahInfo(n);
  const pages = s.pages[1] - s.pages[0] + 1;
  return Math.max(1, Math.ceil((limits.surah10 * pages) / 10));
}

/** The selection's limit: the sum of its units'. */
export function mistakeLimitFor(
  kind: PortionKind,
  ns: readonly number[],
  target: ClassTarget,
  override?: TargetOverride | null,
): number {
  const limits = effectiveLimits(target, override);
  return normaliseSelection(kind, ns).reduce((t, n) => t + unitMistakeLimit(kind, n, limits), 0);
}

const MAX_MINUTES = 240;
const MAX_LIMIT = 999;
const okLimit = (x: number) => Number.isInteger(x) && x >= 0 && x <= MAX_LIMIT;

/** Null when the target can be saved, else a sentence saying what's wrong. */
export function validateClassTarget(t: ClassTarget): string | null {
  const m = [t.minutes.ideal, t.minutes.good, t.minutes.acceptable];
  if (m.some((x) => !Number.isFinite(x) || x <= 0 || x > MAX_MINUTES)) {
    return `Minutes per hizb must be above 0 and at most ${MAX_MINUTES}.`;
  }
  if (!(m[0] <= m[1] && m[1] <= m[2])) return "Ideal, Good and Acceptable minutes must be in order.";
  if (![t.limits.hizb, t.limits.juz, t.limits.surah10].every(okLimit)) {
    return "Each mistake limit must be a whole number from 0.";
  }
  return null;
}

export function validateOverride(o: TargetOverride): string | null {
  if (![o.hizb, o.juz, o.surah10].every((x) => x === null || okLimit(x))) {
    return "Each mistake limit must be a whole number from 0, or blank for the class value.";
  }
  if (o.note && o.note.length > 500) return "Keep the note under 500 characters.";
  return null;
}
