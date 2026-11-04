import { describe, expect, it } from "vitest";
import { firstReadablePage, hasFullMushaf, fullMushafSurahs, surahPageForViewer } from "./mushaf-reach";

describe("who gets the full mushaf", () => {
  it("is only the ustadhs", () => {
    expect(hasFullMushaf("ustadhs")).toBe(true);
    for (const s of ["brothers", "sisters", "demo", null, undefined]) expect(hasFullMushaf(s)).toBe(false);
  });
  it("leaves everyone else starting at Al-Mulk's page", () => {
    expect(firstReadablePage("ustadhs")).toBe(1);
    expect(firstReadablePage("brothers")).toBe(562);
    expect(firstReadablePage("sisters")).toBe(562);
    expect(firstReadablePage(null)).toBe(562);
  });
});

describe("fullMushafSurahs", () => {
  it("is every surah, in mushaf order, with the table's rows for the ones it holds", () => {
    const table = Array.from({ length: 69 }, (_, i) => ({ number: 114 - i, name_en: `T${114 - i}`, name_ar: "x" }));
    const all = fullMushafSurahs(table);
    expect(all).toHaveLength(114);
    expect(all.map((s) => s.number)).toEqual(Array.from({ length: 114 }, (_, i) => i + 1));
    expect(all[0].name_en).toBe("Al-Fatihah");
    expect(all[113].name_en).toBe("T114");
  });
});

describe("surahPageForViewer", () => {
  const starts = { 2: 2, 67: 562, 114: 604 };
  it("opens a surah only if the viewer's mushaf reaches it", () => {
    expect(surahPageForViewer(2, starts, "ustadhs")).toBe(2);
    expect(surahPageForViewer(2, starts, "brothers")).toBeNull();
    expect(surahPageForViewer(67, starts, "brothers")).toBe(562);
    expect(surahPageForViewer(200, starts, "ustadhs")).toBeNull();
  });
});
