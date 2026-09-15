import { describe, it, expect } from "vitest";
import { fmtDay, fmtStamp } from "@/lib/format";
import { commentToShow, recordLine, summaryOf, type HearingSummary } from "./hearings";

const when = "2026-09-10T10:00:00Z";
const day = fmtDay(when);
const stampDay = fmtStamp(when);
const heard = (over: Partial<HearingSummary> = {}): HearingSummary => ({
  submittedAt: when, outcome: "passed", teacherName: "Ustadh Bilal", mistakeCount: 3, ...over,
});
const record = { passedAt: when, comment: null };

describe("recordLine", () => {
  it("reads passed when the record exists", () => {
    expect(recordLine(record, heard())).toBe(`Heard by Ustadh Bilal on ${stampDay} · passed · 3 mistakes`);
  });
  it("reads not passed from the verdict when there is no record", () => {
    expect(recordLine(null, heard({ outcome: "not_passed" }))).toBe(
      `Heard by Ustadh Bilal on ${stampDay} · not passed · 3 mistakes`,
    );
  });
  it("reads not signed off when a pass was undone", () => {
    expect(recordLine(null, heard({ outcome: "passed" }))).toBe(
      `Heard by Ustadh Bilal on ${stampDay} · not signed off · 3 mistakes`,
    );
  });
  it("counts one mistake in the singular", () => {
    expect(recordLine(record, heard({ mistakeCount: 1 }))).toContain("· 1 mistake");
    expect(recordLine(record, heard({ mistakeCount: 0 }))).toContain("· 0 mistakes");
  });
  it("describes a pass made before hearings existed", () => {
    expect(recordLine(record, null)).toBe(`Passed · heard on ${day}`);
  });
  it("says so when nothing has happened", () => {
    expect(recordLine(null, null)).toBe("Not heard yet");
  });
});

describe("summaryOf", () => {
  it("is null when there is no hearing", () => {
    expect(summaryOf(null)).toBeNull();
    expect(summaryOf(undefined)).toBeNull();
  });

  it("reduces a hearing to what recordLine needs", () => {
    expect(
      summaryOf({ submittedAt: when, outcome: "passed", teacherName: "Ustadh Bilal", mistakes: [1, 2, 3] }),
    ).toEqual({ submittedAt: when, outcome: "passed", teacherName: "Ustadh Bilal", mistakeCount: 3 });
  });
});

describe("commentToShow", () => {
  const laterWhen = "2026-09-12T10:00:00Z";
  const passRecord = { comment: "Well done", passedAt: when };
  const notPassed = { note: "Watch the madd in āyah 3", outcome: "not_passed" as const, submittedAt: laterWhen };

  it("shows the Not passed note when it is the latest word", () => {
    expect(commentToShow(passRecord, notPassed)).toEqual({
      text: "Watch the madd in āyah 3", date: laterWhen, kind: "hearing",
    });
  });

  it("falls through to the record comment when the latest hearing passed", () => {
    expect(commentToShow(passRecord, { note: "Nice recitation", outcome: "passed", submittedAt: laterWhen }))
      .toEqual({ text: "Well done", date: when, kind: "record" });
  });

  it("falls through to the record comment when the not-passed note is null", () => {
    expect(commentToShow(passRecord, { note: null, outcome: "not_passed", submittedAt: laterWhen }))
      .toEqual({ text: "Well done", date: when, kind: "record" });
  });

  it("is null when there is nothing to show", () => {
    expect(commentToShow(null, null)).toBeNull();
    expect(commentToShow({ comment: null, passedAt: when }, null)).toBeNull();
  });
});
