import { describe, it, expect } from "vitest";
import type { PaceStatus, Surah } from "@/lib/hifz/pace";
import { memorisationList } from "@/lib/hifz/pace";
import {
  currentSurah,
  expectedSurah,
  sortClassRows,
  CLASS_SORTS,
  type ClassRow,
} from "./class-progress";

/** The real run: order_index 1 = An-Nas (114) … 43 = Al-Jinn (72). */
const surahs: Surah[] = Array.from({ length: 43 }, (_, i) => ({
  number: 114 - i,
  order_index: i + 1,
  name_ar: `س${i + 1}`,
  name_en: `S${i + 1}`,
}));

const run = (startSurah: number, target: number) =>
  memorisationList(startSurah, target, surahs);

describe("currentSurah", () => {
  it("is the very first surah when nothing is passed", () => {
    expect(currentSurah(run(114, 43), new Set())!.number).toBe(114);
  });

  it("is the next one along once the run's opening surahs are signed off", () => {
    // Passed An-Nas (114), Al-Falaq (113), Al-Ikhlas (112) — three in.
    const passed = new Set([114, 113, 112]);
    expect(currentSurah(run(114, 43), passed)!.number).toBe(111);
  });

  it("is the surah still owed when sign-offs land out of order", () => {
    // 111 was signed off before 113 ever was — 113 is what they are still on.
    const passed = new Set([114, 111]);
    expect(currentSurah(run(114, 43), passed)!.number).toBe(113);
  });

  it("is correct for a returning student who does not start at An-Nas", () => {
    // start_surah 100, target 10 → their run is 100, 99, 98 … 91.
    const passed = new Set([100, 99, 98]);
    expect(currentSurah(run(100, 10), passed)!.number).toBe(97);
  });

  it("ignores records outside the student's own run", () => {
    // 114 is above a returning student's start point — last year's work, and
    // no reason to move them off the surah their run opens on.
    const passed = new Set([114, 113]);
    expect(currentSurah(run(100, 10), passed)!.number).toBe(100);
  });

  it("is null once the whole target is passed", () => {
    const passed = new Set([114, 113, 112]);
    expect(currentSurah(run(114, 3), passed)).toBeNull();
  });
});

describe("expectedSurah", () => {
  it("is the opening surah before any week has elapsed", () => {
    expect(expectedSurah(run(114, 43), 0)!.number).toBe(114);
  });

  it("is the one AFTER the surahs the calendar expects finished", () => {
    // 12 done means they should have the 13th in hand.
    const s = expectedSurah(run(114, 43), 12)!;
    expect(s.number).toBe(102);
    expect(s.order_index).toBe(13);
  });

  it("stops at the last surah rather than running off the end of the run", () => {
    expect(expectedSurah(run(114, 3), 3)!.number).toBe(112);
  });

  it("is null for a student with no run at all", () => {
    expect(expectedSurah([], 4)).toBeNull();
  });
});

const row = (
  name: string,
  pace: PaceStatus | null,
  hwAvg: number | null,
): ClassRow => ({
  studentId: name.toLowerCase(),
  name,
  surah: { nameEn: "S4", nameAr: "س4", index: 4 },
  expectedIndex: 5,
  outOf: 43,
  pace,
  hwAvg,
  hifzAvg: 7,
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
