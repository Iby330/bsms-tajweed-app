import { describe, it, expect } from "vitest";
import type { Surah } from "@/lib/hifz/pace";
import { lastPassedSurah } from "./class-progress";

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
