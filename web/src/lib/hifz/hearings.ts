// web/src/lib/hifz/hearings.ts
import { fmtDay, fmtStamp } from "@/lib/format";
import type { MushafPage } from "@/lib/quran/mushaf";

/** Where a surah stands. Derived, never stored (see surahState). */
export type SurahState = "passed" | "not_passed" | "unheard";

/** A submitted hearing's range. `from` is the higher surah number: the run
 *  goes An-Nas (114) first and works down the mushaf. */
export type HearingRange = { from: number; to: number };

/** Does this hearing's range cover the surah? */
export const covers = (h: HearingRange, surah: number): boolean =>
  h.from >= surah && surah >= h.to;

/** The surahs of a range, in memorisation order: from down to to. */
export const rangeSurahs = (from: number, to: number): number[] =>
  Array.from({ length: from - to + 1 }, (_, i) => from - i);

/**
 * The one rule every page uses. A pass record exists only while the latest
 * word on that surah was a pass — unticking it at Finish deletes the record
 * — so a record wins outright. A covering hearing without one is a fail.
 * Nothing is nothing. Passes from before hearings existed have no covering
 * hearing and read as passed.
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
 * Where a hearing ends when Finish is pressed: the surah containing the
 * last word on the page in view, widened so every marked surah is inside
 * the range. A page before the start (a higher surah, or no page) means
 * the end is the start; marks behind the start cannot widen backwards.
 */
export function endSurahFor(
  from: number,
  lastSurahOnPage: number | null,
  markSurahs: Iterable<number>,
): number {
  let end = lastSurahOnPage === null || lastSurahOnPage > from ? from : lastSurahOnPage;
  for (const s of markSurahs) if (s < end) end = s;
  return end;
}

/** The surah of the last word on a page, or null when the page is not in the set. */
export function lastSurahOn(pages: readonly MushafPage[], page: number): number | null {
  const p = pages.find((x) => x.page === page);
  const last = p?.lines.at(-1)?.words.at(-1);
  return last ? last.surah : null;
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
