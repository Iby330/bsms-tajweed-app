import { fmtDay, fmtStamp } from "@/lib/format";

export type HearingOutcome = "passed" | "not_passed";

/** The latest submitted hearing of a surah, reduced to what the line needs. */
export type HearingSummary = {
  submittedAt: string;
  outcome: HearingOutcome | null; // null only on a draft, which callers never pass here
  teacherName: string;
  mistakeCount: number;
};

/** The pass record, if the surah has one. */
export type RecordSummary = { passedAt: string; comment: string | null };

/**
 * The one line under a surah's name that says where it stands.
 *
 * The record is the truth about "passed": a re-hearing that ends Not passed
 * does not take a pass away, and Undo pass takes it away without touching
 * the hearing. So status comes from the record when there is one, and from
 * the verdict only when there is not — and a passed verdict with no record
 * behind it reads as "not signed off", which is exactly what an undone pass
 * is.
 */
export function recordLine(record: RecordSummary | null, hearing: HearingSummary | null): string {
  if (!hearing) return record ? `Passed · heard on ${fmtDay(record.passedAt)}` : "Not heard yet";
  const n = hearing.mistakeCount;
  const mistakes = `${n} mistake${n === 1 ? "" : "s"}`;
  const status = record
    ? "passed"
    : hearing.outcome === "not_passed"
      ? "not passed"
      : "not signed off";
  return `Heard by ${hearing.teacherName} on ${fmtStamp(hearing.submittedAt)} · ${status} · ${mistakes}`;
}

/** What the student reads under the surah: the teacher's note from a
 *  Not passed hearing while that is the latest word, else the pass comment. */
export function commentToShow(
  record: { comment: string | null; passedAt: string } | null,
  latest: { note: string | null; outcome: HearingOutcome | null; submittedAt: string } | null,
): { text: string; date: string; kind: "hearing" | "record" } | null {
  if (latest?.outcome === "not_passed" && latest.note) {
    return { text: latest.note, date: latest.submittedAt, kind: "hearing" };
  }
  if (record?.comment) return { text: record.comment, date: record.passedAt, kind: "record" };
  return null;
}

/** The latest hearing, reduced to what recordLine needs; null when there is none. */
export function summaryOf(
  hearing: { submittedAt: string; outcome: HearingOutcome | null; teacherName: string; mistakes: unknown[] } | null | undefined,
): HearingSummary | null {
  if (!hearing) return null;
  return {
    submittedAt: hearing.submittedAt,
    outcome: hearing.outcome,
    teacherName: hearing.teacherName,
    mistakeCount: hearing.mistakes.length,
  };
}
