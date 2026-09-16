// web/src/lib/hifz/hearings.test.ts
import { describe, it, expect } from "vitest";
import { fmtDay, fmtStamp } from "@/lib/format";
import {
  commentToShow, covers, endSurahFor, lastSurahOn, rangeSurahs, recordLine, summaryOf, surahState,
} from "./hearings";
import type { MushafPage } from "@/lib/quran/mushaf";

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
  it("lists a range in memorisation order", () => {
    expect(rangeSurahs(88, 86)).toEqual([88, 87, 86]);
    expect(rangeSurahs(88, 88)).toEqual([88]);
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
});

describe("endSurahFor", () => {
  it("ends on the surah under the last word of the page in view", () => {
    expect(endSurahFor(88, 86, [])).toBe(86);
  });
  it("a page before the start ends on the start", () => {
    expect(endSurahFor(88, 90, [])).toBe(88);
    expect(endSurahFor(88, null, [])).toBe(88);
  });
  it("widens to cover the furthest mark", () => {
    expect(endSurahFor(88, 87, [88, 85])).toBe(85);
  });
  it("marks behind the start cannot widen backwards", () => {
    expect(endSurahFor(88, 88, [90])).toBe(88);
  });
});

describe("lastSurahOn", () => {
  const page = (n: number, surahs: number[]): MushafPage => ({
    page: n,
    lines: surahs.map((s, i) => ({
      line: i + 1,
      words: [{ surah: s, ayah: 1, position: 1, text: "x", glyph: null, isEnd: false, page: n, line: i + 1 }],
    })),
  });
  it("is the surah of the last word on that page", () => {
    expect(lastSurahOn([page(592, [88]), page(593, [88, 87])], 593)).toBe(87);
  });
  it("is null for a page not in the set", () => {
    expect(lastSurahOn([page(592, [88])], 600)).toBeNull();
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

describe("summaryOf", () => {
  it("null and undefined give null", () => {
    expect(summaryOf(null)).toBeNull();
    expect(summaryOf(undefined)).toBeNull();
  });
  it("reduces a hearing to what the line needs", () => {
    expect(summaryOf({ submittedAt: when, teacherName: "Ustadh Bilal", mistakes: [1, 2, 3] })).toEqual(heard);
  });
});
