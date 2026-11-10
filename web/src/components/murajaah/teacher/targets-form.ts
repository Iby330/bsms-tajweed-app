/**
 * The targets panel's form: what the inputs hold (strings, as typed), how
 * they parse, and what the page previews meanwhile. Pure and client-safe.
 *
 * - A valid class target previews at once; an invalid one keeps the saved
 *   target on screen and shows its error, and Save waits.
 * - A student's override previews the same way, per student.
 * - Blank override boxes mean "the class value"; an override with every box
 *   blank and no note is not an override (saveTargets drops it), so adding
 *   an empty one is not a change.
 */
import {
  validateClassTarget, validateOverride,
  type ClassTarget, type OverrideInput,
} from "@/lib/murajaah/targets";

export type OverrideForm = { studentId: string; hizb: string; juz: string; surah10: string; note: string };
export type TargetsForm = {
  ideal: string; good: string; acceptable: string;
  hizb: string; juz: string; surah10: string;
  overrides: OverrideForm[];
};

export type SavedTargets = { target: ClassTarget; overrides: OverrideInput[] };

const str = (n: number | null | undefined) => (n == null ? "" : String(n));

export function formOf(saved: SavedTargets): TargetsForm {
  const { minutes, limits } = saved.target;
  return {
    ideal: str(minutes.ideal), good: str(minutes.good), acceptable: str(minutes.acceptable),
    hizb: str(limits.hizb), juz: str(limits.juz), surah10: str(limits.surah10),
    overrides: saved.overrides.map((o) => ({
      studentId: o.studentId, hizb: str(o.hizb), juz: str(o.juz), surah10: str(o.surah10), note: o.note ?? "",
    })),
  };
}

/** A typed number; blank or junk is NaN, so validation catches it. */
const num = (s: string) => (s.trim() === "" ? NaN : Number(s.trim()));
/** An override box: blank is null (the class value). */
const opt = (s: string) => (s.trim() === "" ? null : Number(s.trim()));

export function parseTarget(f: TargetsForm): { target: ClassTarget | null; error: string | null } {
  const target: ClassTarget = {
    minutes: { ideal: num(f.ideal), good: num(f.good), acceptable: num(f.acceptable) },
    limits: { hizb: num(f.hizb), juz: num(f.juz), surah10: num(f.surah10) },
  };
  const error = validateClassTarget(target);
  return error ? { target: null, error } : { target, error: null };
}

export function parseOverride(o: OverrideForm): { value: OverrideInput | null; error: string | null } {
  const value: OverrideInput = {
    studentId: o.studentId, hizb: opt(o.hizb), juz: opt(o.juz), surah10: opt(o.surah10),
    note: o.note.trim() || null,
  };
  const error = validateOverride(value);
  return error ? { value: null, error } : { value, error: null };
}

const isEmpty = (o: OverrideInput) => o.hizb === null && o.juz === null && o.surah10 === null && !o.note;

export type ParsedForm = {
  /** The valid target, or null while it has an error. */
  target: ClassTarget | null;
  targetError: string | null;
  /** Valid, non-empty overrides, as saveTargets takes them. */
  overrides: OverrideInput[];
  overrideErrors: Record<string, string>;
  /** Nothing in the way of Save. */
  valid: boolean;
};

export function parseForm(f: TargetsForm): ParsedForm {
  const { target, error } = parseTarget(f);
  const overrides: OverrideInput[] = [];
  const overrideErrors: Record<string, string> = {};
  for (const o of f.overrides) {
    const p = parseOverride(o);
    if (p.error) overrideErrors[o.studentId] = p.error;
    else if (p.value && !isEmpty(p.value)) overrides.push(p.value);
  }
  return { target, targetError: error, overrides, overrideErrors, valid: !error && !Object.keys(overrideErrors).length };
}

/** What the page shows while the form is open: valid edits, else the saved values. */
export function previewOf(f: TargetsForm, saved: SavedTargets): SavedTargets {
  const p = parseForm(f);
  const savedBy = new Map(saved.overrides.map((o) => [o.studentId, o]));
  const overrides: OverrideInput[] = [...p.overrides];
  for (const id of Object.keys(p.overrideErrors)) {
    const keep = savedBy.get(id);
    if (keep) overrides.push(keep);
  }
  return { target: p.target ?? saved.target, overrides };
}

const canon = (s: SavedTargets) =>
  JSON.stringify({
    t: s.target,
    o: [...s.overrides].filter((o) => !isEmpty({ ...o, note: o.note?.trim() || null }))
      .map((o) => ({ id: o.studentId, h: o.hizb, j: o.juz, s: o.surah10, n: o.note?.trim() || null }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });

/** Whether the form says anything different from what is saved. An invalid form always differs. */
export function isDirty(f: TargetsForm, saved: SavedTargets): boolean {
  const p = parseForm(f);
  if (!p.valid || !p.target) return true;
  return canon({ target: p.target, overrides: p.overrides }) !== canon(saved);
}
