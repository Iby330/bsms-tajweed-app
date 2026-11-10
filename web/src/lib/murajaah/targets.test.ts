import { describe, expect, it } from "vitest";
import {
  classTargetFromRow,
  DEFAULT_CLASS_TARGET,
  effectiveLimits,
  mistakeLimitFor,
  overrideFromRow,
  unitMistakeLimit,
  validateClassTarget,
  validateOverride,
} from "./targets";

const T = DEFAULT_CLASS_TARGET;

describe("defaults", () => {
  it("are 10/15/20 minutes and hizb 3, juz 5, surah 3 per 10 pages", () => {
    expect(T).toEqual({
      minutes: { ideal: 10, good: 15, acceptable: 20 },
      limits: { hizb: 3, juz: 5, surah10: 3 },
    });
  });

  it("stand in for a class with no row", () => {
    expect(classTargetFromRow(null)).toEqual(T);
  });
});

describe("classTargetFromRow", () => {
  it("reads a row, numeric columns included", () => {
    expect(
      classTargetFromRow({
        ideal_min: 12, good_min: "16.5" as unknown as number, acceptable_min: 25,
        limit_hizb: 2, limit_juz: 4, limit_surah10: 1,
      }),
    ).toEqual({ minutes: { ideal: 12, good: 16.5, acceptable: 25 }, limits: { hizb: 2, juz: 4, surah10: 1 } });
  });
});

describe("unitMistakeLimit", () => {
  it("gives a hizb and a juz their class value", () => {
    expect(unitMistakeLimit("hizb", 5, T.limits)).toBe(3);
    expect(unitMistakeLimit("juz", 5, T.limits)).toBe(5);
  });

  it("gives a surah its share per 10 pages, rounded up, at least 1", () => {
    expect(unitMistakeLimit("surah", 2, T.limits)).toBe(15); // 48 pages: 14.4 → 15
    expect(unitMistakeLimit("surah", 67, T.limits)).toBe(1); // 3 pages: 0.9 → 1
    expect(unitMistakeLimit("surah", 114, T.limits)).toBe(1); // 1 page: 0.3 → 1
    expect(unitMistakeLimit("surah", 67, { ...T.limits, surah10: 0 })).toBe(1);
  });
});

describe("mistakeLimitFor", () => {
  it("sums its units' limits", () => {
    expect(mistakeLimitFor("hizb", [1, 2], T)).toBe(6);
    expect(mistakeLimitFor("juz", [28, 30], T)).toBe(10);
    expect(mistakeLimitFor("juz", [28, 29, 30], T)).toBe(15);
    expect(mistakeLimitFor("surah", [67, 68], T)).toBe(2);
    expect(mistakeLimitFor("surah", [2], T)).toBe(15);
  });

  it("follows the class's own limits", () => {
    const cls = { ...T, limits: { hizb: 2, juz: 4, surah10: 5 } };
    expect(mistakeLimitFor("hizb", [1, 2], cls)).toBe(4);
    expect(mistakeLimitFor("surah", [2], cls)).toBe(24);
  });

  it("lets a student's override replace the class value for that kind only", () => {
    const ov = { hizb: null, juz: 7, surah10: null };
    expect(mistakeLimitFor("juz", [28, 30], T, ov)).toBe(14);
    expect(mistakeLimitFor("hizb", [1, 2], T, ov)).toBe(6);
    expect(mistakeLimitFor("surah", [2], T, { hizb: null, juz: null, surah10: 1 })).toBe(5);
  });

  it("allows an override of zero", () => {
    expect(mistakeLimitFor("hizb", [1], T, { hizb: 0, juz: null, surah10: null })).toBe(0);
  });
});

describe("effectiveLimits / overrideFromRow", () => {
  it("merges an override over the class", () => {
    expect(effectiveLimits(T, { hizb: 1, juz: null, surah10: null })).toEqual({ hizb: 1, juz: 5, surah10: 3 });
    expect(effectiveLimits(T, null)).toEqual(T.limits);
  });

  it("reads an override row", () => {
    expect(overrideFromRow({ limit_hizb: null, limit_juz: 7, limit_surah10: null, note: "new to juz" })).toEqual({
      hizb: null, juz: 7, surah10: null, note: "new to juz",
    });
    expect(overrideFromRow(null)).toBeNull();
  });
});

describe("validation", () => {
  it("accepts the defaults", () => {
    expect(validateClassTarget(T)).toBeNull();
  });

  it("wants the minutes rising and positive", () => {
    expect(validateClassTarget({ ...T, minutes: { ideal: 15, good: 10, acceptable: 20 } })).toMatch(/order/i);
    expect(validateClassTarget({ ...T, minutes: { ideal: 0, good: 10, acceptable: 20 } })).toMatch(/minutes/i);
    expect(validateClassTarget({ ...T, minutes: { ideal: 10, good: 15, acceptable: 1000 } })).toMatch(/minutes/i);
  });

  it("wants whole, non-negative limits", () => {
    expect(validateClassTarget({ ...T, limits: { hizb: -1, juz: 5, surah10: 3 } })).toMatch(/limit/i);
    expect(validateClassTarget({ ...T, limits: { hizb: 1.5, juz: 5, surah10: 3 } })).toMatch(/limit/i);
    expect(validateOverride({ hizb: null, juz: 2, surah10: null })).toBeNull();
    expect(validateOverride({ hizb: -2, juz: null, surah10: null })).toMatch(/limit/i);
    expect(validateOverride({ hizb: null, juz: null, surah10: null, note: "x".repeat(501) })).toMatch(/note/i);
  });
});
