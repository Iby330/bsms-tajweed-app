import { describe, it, expect } from "vitest";
import { expectedPassed, paceStatus, memorisationList, type Surah } from "./pace";

const weeks = (n: number, startMs: number) =>
  Array.from({ length: n }, (_, i) => ({
    unlock_at: new Date(startMs + i * 7 * 864e5).toISOString(),
  }));

const START = Date.UTC(2026, 9, 5); // 5 Oct 2026

describe("expectedPassed", () => {
  const w = weeks(26, START); // 26 teaching weeks, target 43

  it("is zero before teaching starts", () => {
    expect(expectedPassed(new Date(START - 864e5), w, 43)).toBe(0);
  });
  it("rounds UP — never a fraction of a surah", () => {
    // 1 of 26 weeks → 43/26 = 1.65 → 2
    expect(expectedPassed(new Date(START), w, 43)).toBe(2);
  });
  it("tracks the calendar, not the term count", () => {
    const halfway = new Date(START + 13 * 7 * 864e5); // 14 weeks elapsed
    expect(expectedPassed(halfway, w, 43)).toBe(Math.ceil((14 / 26) * 43));
  });
  it("clamps at the target once the year is over", () => {
    expect(expectedPassed(new Date(START + 400 * 864e5), w, 43)).toBe(43);
  });
  it("handles empty calendars and zero targets", () => {
    expect(expectedPassed(new Date(), [], 43)).toBe(0);
    expect(expectedPassed(new Date(), w, 0)).toBe(0);
  });
});

describe("paceStatus", () => {
  it("ahead / on / behind", () => {
    expect(paceStatus(10, 8)).toBe("ok");
    expect(paceStatus(8, 8)).toBe("warn");
    expect(paceStatus(5, 8)).toBe("danger");
  });
});

describe("memorisationList", () => {
  const surahs: Surah[] = Array.from({ length: 43 }, (_, i) => ({
    number: 114 - i,
    order_index: i + 1,
    name_ar: `س${i}`,
    name_en: `S${i}`,
  }));

  it("a new student starts at An-Nas", () => {
    const list = memorisationList(114, 43, surahs);
    expect(list).toHaveLength(43);
    expect(list[0].number).toBe(114);
    expect(list.at(-1)!.number).toBe(72);
  });
  it("a returning student resumes from their checked surah", () => {
    // passed Nas→Jinn last year is the full 43; a mid-list resume:
    const list = memorisationList(100, 10, surahs);
    expect(list[0].number).toBe(100);
    expect(list).toHaveLength(10);
  });
  it("never runs past the end of the list", () => {
    expect(memorisationList(74, 20, surahs)).toHaveLength(3);
  });
  it("falls back to the start for an unknown surah", () => {
    expect(memorisationList(999, 3, surahs)[0].number).toBe(114);
  });
});
