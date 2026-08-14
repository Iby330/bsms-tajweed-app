import { describe, it, expect } from "vitest";
import { targetPresets, countTo, planTargets } from "./targets";
import type { Surah } from "./pace";

/** The programme's 43 surahs: 114 down to 72, order_index 1..43. */
const surahs: Surah[] = Array.from({ length: 43 }, (_, i) => ({
  number: 114 - i,
  order_index: i + 1,
  name_ar: `س${114 - i}`,
  name_en: `S${114 - i}`,
}));

describe("targetPresets", () => {
  it("a fresh start offers every hizb boundary with cumulative counts", () => {
    const p = targetPresets(114, surahs);
    expect(p.map(({ hizb, endSurah, count }) => ({ hizb, endSurah, count }))).toEqual([
      { hizb: 60, endSurah: 87, count: 28 },
      { hizb: 59, endSurah: 78, count: 37 },
      { hizb: 58, endSurah: 72, count: 43 },
    ]);
  });

  it("a mid-hizb start drops passed boundaries and re-counts from the start", () => {
    // Surah 80 sits inside hizb 59 (78–86): hizb 60 is behind them.
    const p = targetPresets(80, surahs);
    expect(p.map(({ hizb, endSurah, count }) => ({ hizb, endSurah, count }))).toEqual([
      { hizb: 59, endSurah: 78, count: 3 }, // 80, 79, 78
      { hizb: 58, endSurah: 72, count: 9 },
    ]);
  });

  it("a start on the last surah of a hizb still offers that hizb, count 1", () => {
    const p = targetPresets(87, surahs);
    expect(p[0]).toMatchObject({ hizb: 60, endSurah: 87, count: 1 });
    expect(p).toHaveLength(3);
  });

  it("never offers hizb 57 — its surahs are outside the programme", () => {
    for (const start of [114, 80, 72]) {
      expect(targetPresets(start, surahs).map((p) => p.hizb)).not.toContain(57);
    }
  });

  it("labels name the hizb", () => {
    expect(targetPresets(114, surahs)[0].label).toBe("To end of Hizb 60");
  });

  it("an unknown start surah yields nothing rather than a wrong count", () => {
    expect(targetPresets(999, surahs)).toEqual([]);
  });
});

describe("planTargets", () => {
  it("one end surah, per-student counts from each student's own start", () => {
    const { plans, skipped } = planTargets(
      [
        { studentId: "fresh", startSurah: 114 },
        { studentId: "returning", startSurah: 80 },
      ],
      78, // everyone memorizes up to An-Naba
      surahs,
    );
    expect(plans).toEqual([
      { studentId: "fresh", startSurah: 114, count: 37 },
      { studentId: "returning", startSurah: 80, count: 3 },
    ]);
    expect(skipped).toEqual([]);
  });

  it("a student already past the end is skipped, never reset backwards", () => {
    const { plans, skipped } = planTargets(
      [
        { studentId: "ahead", startSurah: 75 }, // starts beyond An-Naba
        { studentId: "fresh", startSurah: 114 },
      ],
      78,
      surahs,
    );
    expect(plans.map((p) => p.studentId)).toEqual(["fresh"]);
    expect(skipped).toEqual(["ahead"]);
  });

  it("an unknown start skips that student rather than inventing a run", () => {
    const { plans, skipped } = planTargets(
      [{ studentId: "odd", startSurah: 999 }],
      78,
      surahs,
    );
    expect(plans).toEqual([]);
    expect(skipped).toEqual(["odd"]);
  });

  it("nobody selected plans nothing", () => {
    expect(planTargets([], 78, surahs)).toEqual({ plans: [], skipped: [] });
  });
});

describe("countTo", () => {
  it("counts inclusively in memorisation order", () => {
    expect(countTo(114, 87, surahs)).toBe(28);
    expect(countTo(114, 72, surahs)).toBe(43);
    expect(countTo(80, 78, surahs)).toBe(3);
  });
  it("start and end on the same surah is a target of one", () => {
    expect(countTo(114, 114, surahs)).toBe(1);
  });
  it("an end before the start is null, not negative", () => {
    expect(countTo(87, 114, surahs)).toBeNull();
  });
  it("unknown surahs are null", () => {
    expect(countTo(999, 87, surahs)).toBeNull();
    expect(countTo(114, 999, surahs)).toBeNull();
  });
});
