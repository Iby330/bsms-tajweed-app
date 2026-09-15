import { describe, it, expect } from "vitest";
import { expectedPassed, paceStatus, memorisationList, passedThisYear, type Surah } from "./pace";

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

/* ── passedThisYear — the year's work, against a lifetime record ─────────── */

describe("passedThisYear", () => {
  const s = (number: number, order_index: number): Surah => ({
    number, order_index, name_ar: `\u0639${number}`, name_en: `S${number}`,
  });
  // The memorisation order: An-Nas (114) first, descending.
  const all = Array.from({ length: 45 }, (_, i) => s(114 - i, i + 1));
  /** A first-year student: the whole run from An-Nas, target 43. */
  const firstYear = all.slice(0, 43);
  /** A returning student: fifteen surahs starting at 86 (order 29). */
  const returning = all.slice(28, 43);

  it("counts a first-year student's list normally", () => {
    const got = passedThisYear(all, firstYear, [114, 113, 112]);
    expect(got.count).toBe(3);
    expect(got.last?.number).toBe(112);
  });

  /**
   * A student two past their target has not made an error — they are two
   * ahead, and the card must say where they actually are. Capping at the
   * list's end named the 43rd surah to someone who left it two surahs ago.
   */
  it("counts past the target and names the surah actually reached", () => {
    const lifetime = all.slice(0, 45).map((x) => x.number);   // 45 of a 43 list
    const got = passedThisYear(all, firstYear, lifetime);
    expect(got.count).toBe(45);
    expect(got.last?.number).toBe(70);                        // the 45th, not the 43rd
  });

  it("does not count an earlier year's work as this year's", () => {
    // 26 surahs from before the returning student's list even begins.
    const lastYear = all.slice(0, 26).map((x) => x.number);
    const got = passedThisYear(all, returning, lastYear);
    expect(got.count).toBe(0);
    expect(got.last).toBeNull();
  });

  it("counts a returning student's own year, and only that", () => {
    const lastYear = all.slice(0, 26).map((x) => x.number);
    const got = passedThisYear(all, returning, [...lastYear, 86, 85]);
    expect(got.count).toBe(2);
    expect(got.last?.number).toBe(85);
  });

  /**
   * THE ORIGINAL REGRESSION. Home did `list[passed - 1]` with the LIFETIME
   * count, so a student past their target indexed off the end of the array
   * and the Arabic surah name stopped rendering altogether.
   */
  it("still names a surah where indexing by the count ran off the end", () => {
    const lifetime = all.slice(0, 45).map((x) => x.number);
    expect(firstYear[lifetime.length - 1]).toBeUndefined();  // what Home did
    expect(passedThisYear(all, firstYear, lifetime).last).not.toBeNull();
  });

  it("does not assume the passed ones are an unbroken run from the top", () => {
    const got = passedThisYear(all, returning, [85]);        // 86 not passed
    expect(got.count).toBe(1);
    expect(got.last?.number).toBe(85);
    expect(got.isPassed(86)).toBe(false);
  });

  it("is empty for a student with no records, and for an empty list", () => {
    expect(passedThisYear(all, firstYear, [])).toMatchObject({ count: 0, last: null });
    expect(passedThisYear(all, [], [114])).toMatchObject({ count: 0, last: null });
  });
});
