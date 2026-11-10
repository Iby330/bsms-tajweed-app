import { describe, expect, it } from "vitest";
import {
  firstPageOf,
  hizbEqOf,
  inRanges,
  isValidSelection,
  normaliseSelection,
  PORTION_COUNT,
  rangesOf,
  runsOf,
  selectionLabel,
  unitName,
  unitOf,
} from "./portions";

describe("unitOf", () => {
  it("runs a hizb from its start to the ayah before the next one starts", () => {
    const u = unitOf("hizb", 1);
    expect(u.from).toEqual({ surah: 1, ayah: 1 });
    expect(u.to).toEqual({ surah: 2, ayah: 74 });
    expect(u.page).toBe(1);
    expect(u.hizbEq).toBe(1);
    expect(u.label).toBe("Hizb 1");
  });

  it("runs the last hizb and the last juz to 114:6", () => {
    expect(unitOf("hizb", 60).to).toEqual({ surah: 114, ayah: 6 });
    expect(unitOf("juz", 30).to).toEqual({ surah: 114, ayah: 6 });
  });

  it("crosses a surah boundary backwards to the previous surah's last ayah", () => {
    // Juz 28 starts at 58:1, so juz 27 ends on Al-Hadid's last ayah (57:29).
    expect(unitOf("juz", 27).to).toEqual({ surah: 57, ayah: 29 });
  });

  it("gives a surah its own ayahs, page and size", () => {
    const u = unitOf("surah", 67);
    expect(u.from).toEqual({ surah: 67, ayah: 1 });
    expect(u.to).toEqual({ surah: 67, ayah: 30 });
    expect(u.page).toBe(562);
    expect(u.hizbEq).toBe(0.3);
    expect(u.label).toBe("Al-Mulk");
  });

  it("sizes a juz as two hizb", () => {
    expect(unitOf("juz", 28).hizbEq).toBe(2);
  });

  it("refuses a unit out of range", () => {
    expect(() => unitOf("hizb", 61)).toThrow(RangeError);
    expect(() => unitOf("juz", 0)).toThrow(RangeError);
    expect(() => unitOf("surah", 115)).toThrow(RangeError);
  });
});

describe("normaliseSelection / isValidSelection", () => {
  it("sorts and dedupes", () => {
    expect(normaliseSelection("juz", [30, 28, 30])).toEqual([28, 30]);
  });

  it("rejects empty, out-of-range and non-integer selections", () => {
    expect(() => normaliseSelection("hizb", [])).toThrow(RangeError);
    expect(() => normaliseSelection("hizb", [0])).toThrow(RangeError);
    expect(() => normaliseSelection("juz", [31])).toThrow(RangeError);
    expect(() => normaliseSelection("surah", [1.5])).toThrow(RangeError);
    expect(isValidSelection("surah", [114])).toBe(true);
    expect(isValidSelection("surah", [])).toBe(false);
    expect(isValidSelection("bogus" as never, [1])).toBe(false);
  });

  it("knows each kind's count", () => {
    expect(PORTION_COUNT).toEqual({ hizb: 60, juz: 30, surah: 114 });
  });
});

describe("runsOf", () => {
  it("splits sorted numbers into consecutive runs", () => {
    expect(runsOf([28, 29, 30])).toEqual([[28, 29, 30]]);
    expect(runsOf([28, 30])).toEqual([[28], [30]]);
    expect(runsOf([1, 2, 5, 7, 8])).toEqual([[1, 2], [5], [7, 8]]);
  });
});

describe("selectionLabel", () => {
  it("joins separate juz with +", () => {
    expect(selectionLabel("juz", [30, 28])).toBe("Juz 28 + 30");
  });

  it("joins a consecutive run with an en dash", () => {
    expect(selectionLabel("juz", [28, 29, 30])).toBe("Juz 28–30");
    expect(selectionLabel("hizb", [57, 58, 59, 60])).toBe("Hizb 57–60");
  });

  it("names a single unit", () => {
    expect(selectionLabel("hizb", [5])).toBe("Hizb 5");
    expect(selectionLabel("surah", [67])).toBe("Surah Al-Mulk");
  });

  it("mixes runs and singles", () => {
    expect(selectionLabel("hizb", [1, 2, 5])).toBe("Hizb 1–2 + 5");
  });

  it("names two surahs with +, and a longer run with its count", () => {
    expect(selectionLabel("surah", [67, 68])).toBe("Al-Mulk + Al-Qalam");
    expect(selectionLabel("surah", [67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77])).toBe(
      "Al-Mulk–Al-Mursalat (11 surahs)",
    );
    expect(selectionLabel("surah", [1, 67, 68])).toBe("Al-Fatihah + Al-Mulk + Al-Qalam");
  });

  it("is empty for an empty selection", () => {
    expect(selectionLabel("juz", [])).toBe("");
  });
});

describe("unitName", () => {
  it("names one unit of each kind", () => {
    expect(unitName("hizb", 57)).toBe("Hizb 57");
    expect(unitName("juz", 30)).toBe("Juz 30");
    expect(unitName("surah", 2)).toBe("Al-Baqarah");
  });
});

describe("hizbEqOf", () => {
  it("sums units", () => {
    expect(hizbEqOf("juz", [28, 29, 30])).toBe(6);
    expect(hizbEqOf("hizb", [1, 2])).toBe(2);
  });

  it("sizes a surah by pages ÷ 10", () => {
    expect(hizbEqOf("surah", [2])).toBe(4.8);
    expect(hizbEqOf("surah", [1])).toBe(0.1);
    // Shared pages count for both: Al-Mulk 562-564 and Al-Qalam 564-566.
    expect(hizbEqOf("surah", [67, 68])).toBe(0.6);
  });

  it("does not drift with float sums", () => {
    expect(hizbEqOf("surah", [1, 114, 113])).toBe(0.3);
  });
});

describe("rangesOf / inRanges", () => {
  it("merges a consecutive run into one range", () => {
    expect(rangesOf("juz", [29, 30])).toEqual([
      { from: { surah: 67, ayah: 1 }, to: { surah: 114, ayah: 6 } },
    ]);
  });

  it("keeps separate runs apart", () => {
    expect(rangesOf("juz", [30, 28])).toEqual([
      { from: { surah: 58, ayah: 1 }, to: { surah: 66, ayah: 12 } },
      { from: { surah: 78, ayah: 1 }, to: { surah: 114, ayah: 6 } },
    ]);
  });

  it("answers whether an ayah is inside", () => {
    const r = rangesOf("juz", [28, 30]);
    expect(inRanges(r, 58, 1)).toBe(true);
    expect(inRanges(r, 66, 12)).toBe(true);
    expect(inRanges(r, 67, 1)).toBe(false);
    expect(inRanges(r, 114, 6)).toBe(true);
    expect(inRanges(r, 57, 29)).toBe(false);
  });
});

describe("firstPageOf", () => {
  it("opens at the lowest unit's page", () => {
    expect(firstPageOf("juz", [30, 28])).toBe(542);
    expect(firstPageOf("surah", [114, 67])).toBe(562);
    expect(firstPageOf("hizb", [60])).toBe(591);
  });
});
