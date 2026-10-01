import { describe, it, expect } from "vitest";
import { fmtDay, fmtStamp } from "@/lib/format";
import {
  commentToShow, covers, doneLine, endSurahFor, heardSurahs, rangeSurahs, recordLine, summaryOf,
  surahState,
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
  it("ends on the planned end when nothing is marked", () => {
    expect(endSurahFor(88, 86, [])).toBe(86);
  });
  it("a one-surah plan ends on the start", () => {
    expect(endSurahFor(88, 88, [])).toBe(88);
  });
  it("a mark beyond the planned end widens the range to cover it", () => {
    expect(endSurahFor(88, 87, [88, 85])).toBe(85);
  });
  it("marks inside the plan never pull the end in", () => {
    expect(endSurahFor(88, 85, [88, 87])).toBe(85);
  });
  it("marks behind the start cannot widen backwards", () => {
    expect(endSurahFor(88, 88, [90])).toBe(88);
  });
  it("a planned end above the start falls back to the start", () => {
    expect(endSurahFor(88, 90, [])).toBe(88);
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

describe("doneLine", () => {
  const names = { 88: { en: "Al-Ghashiyah" }, 87: { en: "Al-A'la" }, 86: { en: "At-Tariq" } };
  it("names just the surah for a single-surah hearing", () => {
    expect(doneLine(88, 88, new Set(), names)).toBe("Heard Al-Ghashiyah · 0 passed · 1 not passed");
  });
  it("spans a range and counts what passed", () => {
    expect(doneLine(88, 86, new Set([88, 87]), names)).toBe(
      "Heard Al-Ghashiyah → At-Tariq · 2 passed · 1 not passed",
    );
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
