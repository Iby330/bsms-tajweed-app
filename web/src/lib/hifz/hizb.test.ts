import { describe, it, expect } from "vitest";
import { hizbOf, juzOf, assumedPassed } from "./hizb";
import type { Surah } from "./pace";

/** The real run: order_index 1..43 = surah 114 down to 72. */
export const RUN: Surah[] = Array.from({ length: 43 }, (_, i) => ({
  number: 114 - i,
  order_index: i + 1,
  name_ar: `س${114 - i}`,
  name_en: `S${114 - i}`,
}));

describe("hizbOf — standard mushaf bounds", () => {
  it("hizb 60 runs Al-A'la (87) to An-Nas (114)", () => {
    expect(hizbOf(114)).toBe(60);
    expect(hizbOf(87)).toBe(60);
    expect(hizbOf(86)).toBe(59); // At-Tariq is hizb 59, NOT 60
  });
  it("hizb 59 runs An-Naba (78) to At-Tariq (86)", () => {
    expect(hizbOf(78)).toBe(59);
    expect(hizbOf(77)).toBe(58); // Al-Mursalat starts hizb 58's range
  });
  it("hizb 58 runs Al-Jinn (72) to Al-Mursalat (77) — the run ends on its boundary", () => {
    expect(hizbOf(72)).toBe(58);
    expect(hizbOf(71)).toBe(57); // Nuh — outside the programme
  });
  it("returns null outside the mapped ranges", () => {
    expect(hizbOf(66)).toBeNull();
  });
});

describe("juzOf", () => {
  it("Juz 'Amma is 78–114, Tabarak is 67–77", () => {
    expect(juzOf(114)).toBe(30);
    expect(juzOf(78)).toBe(30);
    expect(juzOf(77)).toBe(29);
    expect(juzOf(67)).toBe(29);
    expect(juzOf(66)).toBeNull();
  });
});

describe("assumedPassed", () => {
  it("a fresh student's set is just their records", () => {
    const passed = new Set([114, 113]);
    expect(assumedPassed(RUN, RUN, passed)).toEqual(new Set([114, 113]));
  });
  it("a returning student's pre-start surahs count as passed", () => {
    const list = RUN.slice(10); // starts at surah 104
    const out = assumedPassed(RUN, list, new Set([104]));
    expect(out.has(114)).toBe(true);  // done last year
    expect(out.has(105)).toBe(true);
    expect(out.has(104)).toBe(true);  // this year's record
    expect(out.has(103)).toBe(false); // not yet passed
    expect(out.size).toBe(11);
  });
  it("an empty list adds nothing", () => {
    expect(assumedPassed(RUN, [], new Set([114]))).toEqual(new Set([114]));
  });
});
