import { fmtDay, fmtStamp } from "@/lib/format";
import { londonDate } from "@/lib/attendance/session";

/** Where a surah stands. Derived, never stored (see surahState). */
export type SurahState = "passed" | "not_passed" | "unheard";

/** A submitted hearing's range. `from` is the higher surah number: the run
 *  goes An-Nas (114) first and works down the mushaf. `countsAsResult` is
 *  false for a Hear tab marking session, which carries marks and no result;
 *  left out, a range is a result (every session from before the column). */
export type HearingRange = { from: number; to: number; countsAsResult?: boolean };

/** Does this session carry a result, rather than only marks? */
export const isResult = (h: { countsAsResult?: boolean }): boolean => h.countsAsResult !== false;

/** Does this hearing's range cover the surah? */
export const covers = (h: HearingRange, surah: number): boolean =>
  h.from >= surah && surah >= h.to;

/** The surahs of a range, in memorisation order: from down to to. */
export function rangeSurahs(from: number, to: number): number[] {
  // Memorisation order runs down the mushaf, so to can never exceed from.
  if (to > from) throw new RangeError(`rangeSurahs: ${from} → ${to} runs the wrong way`);
  return Array.from({ length: from - to + 1 }, (_, i) => from - i);
}

/** Every surah a submitted result covered — the red cells. Marking
 *  sessions are left out: a mark alone never makes a surah not passed. */
export function heardSurahs(hearings: readonly HearingRange[]): Set<number> {
  return new Set(hearings.filter(isResult).flatMap((h) => rangeSurahs(h.from, h.to)));
}

/**
 * The one rule every page uses. A pass record exists only while the latest
 * word on that surah was a pass — unticking it at Finish deletes the record
 * — so a record wins outright. A covering result without one is a fail.
 * Nothing is nothing, and marks alone are nothing: only a session that
 * counts as a result covers. Passes from before hearings existed have no
 * covering hearing and read as passed.
 *
 * Enforced in recordResults (hearing-actions.ts): unticking deletes the
 * record — any new pass path must keep that, or this rule reads a revoked
 * surah as passed.
 */
export function surahState(
  surah: number,
  passed: ReadonlySet<number>,
  hearings: readonly HearingRange[],
): SurahState {
  if (passed.has(surah)) return "passed";
  return hearings.some((h) => isResult(h) && covers(h, surah)) ? "not_passed" : "unheard";
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

/** The newest session that counts as a result, from a newest-first list. */
export function latestResult<H extends { countsAsResult?: boolean }>(hearings: readonly H[]): H | null {
  return hearings.find(isResult) ?? null;
}

/**
 * The latest result on a surah, reduced to what recordLine needs; null when
 * there is none, whatever was marked. `hearings` is newest first, each with
 * its marks on the surah. Marks now live in marking sessions apart from the
 * result, so a result's count is every mark made after the result before it
 * and up to this one, from any session: a hearing from before the split
 * holds its own marks, which fall in the same window.
 */
export function summaryOf(
  hearings: readonly {
    submittedAt: string;
    teacherName: string;
    countsAsResult?: boolean;
    mistakes: readonly { created_at: string }[];
  }[],
): HearingSummary | null {
  const results = hearings.filter(isResult);
  const latest = results[0];
  if (!latest) return null;
  const until = Date.parse(latest.submittedAt);
  const since = results[1] ? Date.parse(results[1].submittedAt) : -Infinity;
  const mistakeCount = hearings
    .flatMap((h) => h.mistakes)
    .filter((m) => {
      const at = Date.parse(m.created_at);
      return at > since && at <= until;
    }).length;
  return { submittedAt: latest.submittedAt, teacherName: latest.teacherName, mistakeCount };
}

/**
 * The marking session a teacher's tap on a student goes into: the oldest one
 * started on today's date in the UK (Europe/London), or null for a new day.
 * Ties go to the lower id, so two racing first taps that each made a session
 * still agree on one.
 */
export function todaysSession<T extends { id: string; started_at: string }>(rows: readonly T[], now: Date): T | null {
  const today = londonDate(now);
  return [...rows]
    .sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .find((r) => londonDate(new Date(r.started_at)) === today) ?? null;
}
