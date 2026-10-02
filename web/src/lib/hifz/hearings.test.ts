import { describe, it, expect } from "vitest";
import { fmtDay, fmtStamp } from "@/lib/format";
import {
  commentToShow, covers, heardSurahs, latestResult, rangeSurahs, recordLine, summaryOf,
  surahState, todaysSession,
} from "./hearings";

const when = "2026-09-10T10:00:00Z";
const heard = { submittedAt: when, teacherName: "Ustadh Bilal", mistakeCount: 3 };
const record = { passedAt: "2026-09-10", comment: null };

describe("covers / rangeSurahs", () => {
  it("covers runs from the higher number down to the lower", () => {
    expect(covers({ from: 88, to: 86 }, 87)).toBe(true);
    expect(covers({ from: 88, to: 86 }, 88)).toBe(true);
    expect(covers({ from: 88, to: 86 }, 86)).toBe(true);
    expect(covers({ from: 88, to: 86 }, 89)).toBe(false);
    expect(covers({ from: 88, to: 86 }, 85)).toBe(false);
  });
  it("a single-surah range covers only that surah", () => {
    expect(covers({ from: 88, to: 88 }, 88)).toBe(true);
    expect(covers({ from: 88, to: 88 }, 87)).toBe(false);
    expect(covers({ from: 88, to: 88 }, 89)).toBe(false);
  });
  it("lists a range in memorisation order", () => {
    expect(rangeSurahs(88, 86)).toEqual([88, 87, 86]);
    expect(rangeSurahs(88, 88)).toEqual([88]);
  });
  it("throws when to runs past from", () => {
    expect(() => rangeSurahs(86, 88)).toThrow(RangeError);
  });
});

describe("heardSurahs", () => {
  it("unions overlapping ranges with no duplicates", () => {
    const result = heardSurahs([{ from: 90, to: 87 }, { from: 88, to: 85 }]);
    expect([...result].sort((a, b) => a - b)).toEqual([85, 86, 87, 88, 89, 90]);
  });
  it("is empty for no hearings", () => {
    expect(heardSurahs([])).toEqual(new Set());
  });
  it("leaves out sessions that only carry marks", () => {
    const result = heardSurahs([{ from: 90, to: 90, countsAsResult: false }, { from: 88, to: 88, countsAsResult: true }]);
    expect([...result]).toEqual([88]);
  });
});

describe("surahState", () => {
  const passed = new Set([114, 113]);
  const hearings = [{ from: 113, to: 111 }];
  it("passed wins whenever a record exists", () => {
    expect(surahState(113, passed, hearings)).toBe("passed");
    expect(surahState(114, passed, hearings)).toBe("passed");   // legacy pass, no hearing
  });
  it("a covering hearing without a record is not passed", () => {
    expect(surahState(112, passed, hearings)).toBe("not_passed");
    expect(surahState(111, passed, hearings)).toBe("not_passed");
  });
  it("nothing is unheard", () => {
    expect(surahState(110, passed, hearings)).toBe("unheard");
  });
  it("a surah with marks but no result stays unheard", () => {
    expect(surahState(110, passed, [{ from: 110, to: 110, countsAsResult: false }])).toBe("unheard");
  });
  it("a result covering it still makes it not passed beside a marking session", () => {
    expect(surahState(110, passed, [
      { from: 110, to: 110, countsAsResult: false },
      { from: 110, to: 109, countsAsResult: true },
    ])).toBe("not_passed");
  });
});

describe("recordLine", () => {
  it("reads passed with a hearing", () => {
    expect(recordLine("passed", record, heard)).toBe(
      `Heard by Ustadh Bilal on ${fmtStamp(when)} · passed · 3 mistakes`,
    );
  });
  it("reads not passed", () => {
    expect(recordLine("not_passed", null, { ...heard, mistakeCount: 1 })).toBe(
      `Heard by Ustadh Bilal on ${fmtStamp(when)} · not passed · 1 mistake`,
    );
  });
  it("describes a pass from before hearings existed", () => {
    expect(recordLine("passed", record, null)).toBe(`Passed · heard on ${fmtDay("2026-09-10")}`);
  });
  it("says so when nothing has happened", () => {
    expect(recordLine("unheard", null, null)).toBe("Not heard yet");
  });
});

describe("commentToShow", () => {
  const latest = { note: "tighten the madd", submittedAt: when };
  it("a passed surah shows its pass comment", () => {
    expect(commentToShow("passed", { ...record, comment: "well read" }, latest)).toEqual({
      text: "well read", date: "2026-09-10", kind: "record",
    });
  });
  it("a passed surah with no comment shows nothing, even with a hearing note", () => {
    expect(commentToShow("passed", record, latest)).toBeNull();
  });
  it("a not-passed surah shows the latest hearing's note", () => {
    expect(commentToShow("not_passed", null, latest)).toEqual({
      text: "tighten the madd", date: when, kind: "hearing",
    });
  });
  it("nothing → null", () => {
    expect(commentToShow("unheard", null, null)).toBeNull();
    expect(commentToShow("not_passed", null, { note: null, submittedAt: when })).toBeNull();
  });
});

describe("latestResult", () => {
  it("is the newest session that counts as a result", () => {
    const marking = { from: 88, to: 88, countsAsResult: false, submittedAt: "2026-09-12T10:00:00Z" };
    const result = { from: 88, to: 87, countsAsResult: true, submittedAt: "2026-09-11T10:00:00Z" };
    expect(latestResult([marking, result])).toBe(result);
    expect(latestResult([marking])).toBeNull();
    expect(latestResult([])).toBeNull();
  });
});

describe("summaryOf", () => {
  const m = (created_at: string) => ({ created_at });
  it("no result gives null, even with marks", () => {
    expect(summaryOf([])).toBeNull();
    expect(summaryOf([
      { submittedAt: when, teacherName: "Ustadh Bilal", countsAsResult: false, mistakes: [m(when)] },
    ])).toBeNull();
  });
  it("a legacy hearing counts its own marks", () => {
    expect(summaryOf([
      { submittedAt: when, teacherName: "Ustadh Bilal", countsAsResult: true,
        mistakes: [m("2026-09-10T09:00:00Z"), m("2026-09-10T09:10:00Z"), m("2026-09-10T09:20:00Z")] },
    ])).toEqual(heard);
  });
  it("a result counts the marks made since the result before it, from any session", () => {
    const summary = summaryOf([
      { submittedAt: "2026-09-10T11:00:00Z", teacherName: "x", countsAsResult: false,
        mistakes: [m("2026-09-10T11:00:00Z")] },                       // after the result: not its marks
      { submittedAt: when, teacherName: "Ustadh Bilal", countsAsResult: true, mistakes: [] },
      { submittedAt: "2026-09-10T09:00:00Z", teacherName: "x", countsAsResult: false,
        mistakes: [m("2026-09-10T09:00:00Z"), m("2026-09-10T09:30:00Z"), m("2026-09-03T09:30:00Z")] },
      { submittedAt: "2026-09-03T10:00:00Z", teacherName: "x", countsAsResult: true, mistakes: [] },
    ]);
    expect(summary).toEqual({ submittedAt: when, teacherName: "Ustadh Bilal", mistakeCount: 2 });
  });
});

describe("todaysSession", () => {
  it("is the oldest session started on today's UK date", () => {
    const now = new Date("2026-10-02T12:00:00Z");
    const rows = [
      { id: "b", started_at: "2026-10-02T09:00:00Z" },
      { id: "a", started_at: "2026-10-01T23:30:00Z" },   // 00:30 BST on the 2nd: today in the UK
      { id: "old", started_at: "2026-10-01T22:30:00Z" }, // 23:30 BST on the 1st
    ];
    expect(todaysSession(rows, now)?.id).toBe("a");
    expect(todaysSession([rows[2]], now)).toBeNull();
  });
});
