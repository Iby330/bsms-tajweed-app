import { fmtDay, fmtStamp } from "@/lib/format";

/** Where a surah stands. Derived, never stored (see surahState). */
export type SurahState = "passed" | "not_passed" | "unheard";

/** A submitted hearing's range. `from` is the higher surah number: the run
 *  goes An-Nas (114) first and works down the mushaf. */
export type HearingRange = { from: number; to: number };

/** Does this hearing's range cover the surah? */
export const covers = (h: HearingRange, surah: number): boolean =>
  h.from >= surah && surah >= h.to;

/** The surahs of a range, in memorisation order: from down to to. */
export function rangeSurahs(from: number, to: number): number[] {
  // Memorisation order runs down the mushaf, so to can never exceed from.
  if (to > from) throw new RangeError(`rangeSurahs: ${from} → ${to} runs the wrong way`);
  return Array.from({ length: from - to + 1 }, (_, i) => from - i);
}

/** Every surah any submitted hearing covered — the red cells. */
export function heardSurahs(hearings: readonly HearingRange[]): Set<number> {
  return new Set(hearings.flatMap((h) => rangeSurahs(h.from, h.to)));
}

/**
 * The one rule every page uses. A pass record exists only while the latest
 * word on that surah was a pass — unticking it at Finish deletes the record
 * — so a record wins outright. A covering hearing without one is a fail.
 * Nothing is nothing. Passes from before hearings existed have no covering
 * hearing and read as passed.
 *
 * Enforced in submitHearing (hearing-actions.ts): unticking deletes the
 * record — any new pass path must keep that, or this rule reads a revoked
 * surah as passed.
 */
export function surahState(
  surah: number,
  passed: ReadonlySet<number>,
  hearings: readonly HearingRange[],
): SurahState {
  if (passed.has(surah)) return "passed";
  return hearings.some((h) => covers(h, surah)) ? "not_passed" : "unheard";
}

/**
 * Where a hearing ends when End hearing is pressed: the end planned at
 * Start, widened so every marked surah is inside the range. Marks inside
 * the plan never pull the end in; marks behind the start (a higher number)
 * cannot widen it backwards. A planned end above the start, which nothing
 * should send, falls back to the start.
 */
export function endSurahFor(
  from: number,
  plannedTo: number,
  markSurahs: Iterable<number>,
): number {
  let end = plannedTo > from ? from : plannedTo;
  for (const s of markSurahs) if (s < end) end = s;
  return end;
}

/**
 * The line shown on the Hear tab after a hearing is confirmed: what was
 * heard, and how much of it passed. A single-surah range names just that
 * surah rather than repeating it as "X → X".
 */
export function doneLine(
  from: number,
  to: number,
  passed: ReadonlySet<number>,
  names: Record<number, { en: string }>,
): string {
  const range = rangeSurahs(from, to);
  const name = (n: number) => names[n]?.en ?? String(n);
  const span = range.length === 1 ? name(from) : `${name(from)} → ${name(to)}`;
  const p = range.filter((n) => passed.has(n)).length;
  return `Heard ${span} · ${p} passed · ${range.length - p} not passed`;
}

/** The latest submitted hearing covering a surah, reduced to what the line needs. */
export type HearingSummary = { submittedAt: string; teacherName: string; mistakeCount: number };

/** The pass record, if the surah has one. */
export type RecordSummary = { passedAt: string; comment: string | null };

/** The one line under a surah's name that says where it stands. */
export function recordLine(
  state: SurahState,
  record: RecordSummary | null,
  hearing: HearingSummary | null,
): string {
  if (!hearing) {
    return state === "passed" && record ? `Passed · heard on ${fmtDay(record.passedAt)}` : "Not heard yet";
  }
  const n = hearing.mistakeCount;
  const mistakes = `${n} mistake${n === 1 ? "" : "s"}`;
  const status = state === "passed" ? "passed" : "not passed";
  return `Heard by ${hearing.teacherName} on ${fmtStamp(hearing.submittedAt)} · ${status} · ${mistakes}`;
}

/** What the student reads under the surah: the pass comment while it is
 *  passed, else the latest hearing's note. */
export function commentToShow(
  state: SurahState,
  record: RecordSummary | null,
  latest: { note: string | null; submittedAt: string } | null,
): { text: string; date: string; kind: "hearing" | "record" } | null {
  if (state === "passed") {
    return record?.comment ? { text: record.comment, date: record.passedAt, kind: "record" } : null;
  }
  if (latest?.note) return { text: latest.note, date: latest.submittedAt, kind: "hearing" };
  return null;
}

/** The latest hearing, reduced to what recordLine needs; null when there is none. */
export function summaryOf(
  hearing: { submittedAt: string; teacherName: string; mistakes: unknown[] } | null | undefined,
): HearingSummary | null {
  if (!hearing) return null;
  return { submittedAt: hearing.submittedAt, teacherName: hearing.teacherName, mistakeCount: hearing.mistakes.length };
}
