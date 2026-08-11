import { describe, it, expect } from "vitest";
import type { PaceStatus, Surah } from "@/lib/hifz/pace";
import { lastPassedSurah, sortClassRows, CLASS_SORTS, type ClassRow } from "./class-progress";

/** The real run: order_index 1 = An-Nas (114) … 43 = Al-Jinn (72). */
const surahs: Surah[] = Array.from({ length: 43 }, (_, i) => ({
  number: 114 - i,
  order_index: i + 1,
  name_ar: `س${i + 1}`,
  name_en: `S${i + 1}`,
}));

describe("lastPassedSurah", () => {
  it("returns null when nothing is passed", () => {
    expect(lastPassedSurah(114, 43, surahs, new Set())).toBeNull();
  });

  it("returns the furthest-along record, not the first one found", () => {
    // Passed An-Nas (114), Al-Falaq (113), Al-Ikhlas (112) — three in.
    const passed = new Set([114, 113, 112]);
    expect(lastPassedSurah(114, 43, surahs, passed)!.number).toBe(112);
  });

  it("is furthest-along even when sign-offs land out of order", () => {
    // 111 was signed off before 113 ever was; 111 is still deeper into the run.
    const passed = new Set([114, 111]);
    expect(lastPassedSurah(114, 43, surahs, passed)!.number).toBe(111);
  });

  it("is correct for a returning student who does not start at An-Nas", () => {
    // start_surah 100, target 10 → their run is 100, 99, 98 … 91.
    const passed = new Set([100, 99, 98]);
    expect(lastPassedSurah(100, 10, surahs, passed)!.number).toBe(98);
  });

  it("ignores records outside the student's own run", () => {
    // 114 is above a returning student's start point — last year's work.
    const passed = new Set([114, 113, 100]);
    expect(lastPassedSurah(100, 10, surahs, passed)!.number).toBe(100);
  });

  it("returns the final surah once the whole target is passed", () => {
    const passed = new Set([114, 113, 112]);
    expect(lastPassedSurah(114, 3, surahs, passed)!.number).toBe(112);
  });
});

const row = (
  name: string,
  pace: PaceStatus | null,
  hwAvg: number | null,
): ClassRow => ({
  studentId: name.toLowerCase(),
  name,
  lastPassed: "S3",
  passed: 3,
  target: 43,
  expected: 4,
  pace,
  hwAvg,
});

const names = (rows: ClassRow[]) => rows.map((r) => r.name);

describe("sortClassRows", () => {
  const rows: ClassRow[] = [
    row("Aisha", "ok", 87.4),
    row("Bilal", "warn", 72.1),
    row("Khadija", "ok", 91.2),
    row("Yusuf", "danger", 64.8),
    row("Zainab", "danger", 71),
  ];

  it("attention puts behind first, then on pace, then ahead", () => {
    expect(names(sortClassRows(rows, "attention"))).toEqual([
      "Yusuf", "Zainab", "Bilal", "Aisha", "Khadija",
    ]);
  });

  it("name sorts A-Z", () => {
    expect(names(sortClassRows(rows, "name"))).toEqual([
      "Aisha", "Bilal", "Khadija", "Yusuf", "Zainab",
    ]);
  });

  it("lowest-hw sorts by homework average ascending", () => {
    expect(names(sortClassRows(rows, "lowest-hw"))).toEqual([
      "Yusuf", "Zainab", "Bilal", "Aisha", "Khadija",
    ]);
  });

  it("sinks a student with no target to the bottom of attention", () => {
    // A missing hifz profile is a data gap, not a struggling student.
    const withGap = [...rows, row("Musa", null, 55)];
    expect(names(sortClassRows(withGap, "attention")).at(-1)).toBe("Musa");
  });

  it("sinks unmarked homework to the bottom rather than scoring it zero", () => {
    // Scoring null as 0 would head the list with a student nobody has marked,
    // burying the genuinely weakest one.
    const withGap = [...rows, row("Musa", "warn", null)];
    const sorted = names(sortClassRows(withGap, "lowest-hw"));
    expect(sorted.at(-1)).toBe("Musa");
    expect(sorted[0]).toBe("Yusuf");
  });

  it("treats a NaN average as no average at all", () => {
    const withNaN = [row("Musa", "warn", NaN), row("Aisha", "ok", 87.4)];
    expect(names(sortClassRows(withNaN, "lowest-hw"))).toEqual(["Aisha", "Musa"]);
  });

  it("falls back to name on a tie, so the order never shuffles", () => {
    const tied = [row("Zainab", "warn", 70), row("Aisha", "warn", 70)];
    expect(names(sortClassRows(tied, "attention"))).toEqual(["Aisha", "Zainab"]);
    expect(names(sortClassRows(tied, "lowest-hw"))).toEqual(["Aisha", "Zainab"]);
  });

  it("does not mutate the input", () => {
    const input = [...rows];
    sortClassRows(input, "attention");
    expect(names(input)).toEqual(names(rows));
  });

  it("offers exactly the three orderings the dropdown renders", () => {
    expect(CLASS_SORTS).toEqual(["attention", "name", "lowest-hw"]);
  });
});
