import { describe, it, expect } from "vitest";
import { fmtDay } from "@/lib/format";
import { recordLine, type HearingSummary } from "./hearings";

const when = "2026-09-10T10:00:00Z";
const day = fmtDay(when);
const heard = (over: Partial<HearingSummary> = {}): HearingSummary => ({
  submittedAt: when, outcome: "passed", teacherName: "Ustadh Bilal", mistakeCount: 3, ...over,
});
const record = { passedAt: when, comment: null };

describe("recordLine", () => {
  it("reads passed when the record exists", () => {
    expect(recordLine(record, heard())).toBe(`Heard by Ustadh Bilal on ${day} · passed · 3 mistakes`);
  });
  it("reads not passed from the verdict when there is no record", () => {
    expect(recordLine(null, heard({ outcome: "not_passed" }))).toBe(
      `Heard by Ustadh Bilal on ${day} · not passed · 3 mistakes`,
    );
  });
  it("reads not signed off when a pass was undone", () => {
    expect(recordLine(null, heard({ outcome: "passed" }))).toBe(
      `Heard by Ustadh Bilal on ${day} · not signed off · 3 mistakes`,
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
