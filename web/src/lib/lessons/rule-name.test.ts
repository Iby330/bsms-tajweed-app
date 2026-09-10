import { describe, expect, it } from "vitest";
import { ruleName } from "./rule-name";

describe("ruleName", () => {
  // Every title in the database, verbatim — trailing spaces and all.
  it.each([
    ["Tajweed 1: Tajweed Homework: Introduction", "Introduction"],
    [
      "Tajweed 2: Tajweed Homework: Ghunna of Meem and Noon Mushaddah",
      "Ghunna of Meem and Noon Mushaddah",
    ],
    ["Tajweed 3: Idhaar Halqy ", "Idhaar Halqy"],
    [
      "Tajweed 4: Tajweed Homework 4 : Idghaam of Noon Sakin/Tanween   ",
      "Idghaam of Noon Sakin/Tanween",
    ],
    ["Tajweed 5: Iqlaab ", "Iqlaab"],
    ["Tajweed 6: Tajweed Homework 6 : Ikhfaa Haqiqy ", "Ikhfaa Haqiqy"],
    [
      "Tajweed 7: Tajweed Homework 7 : Summary of Noon Sakin and Tanween ",
      "Summary of Noon Sakin and Tanween",
    ],
    ["Tajweed 8: Tajweed Homework 8 : Rules of Meem Sakin ", "Rules of Meem Sakin"],
    ["Tajweed 9: Tajweed Homework 9 : The Heavy Letters ", "The Heavy Letters"],
    ["Tajweed 10: The Heaviness of Laam", "The Heaviness of Laam"],
    ["Tajweed 11: The Heaviness of Ra", "The Heaviness of Ra"],
    ["Tajweed 12: Tajweed Homework 12 : Qalqala", "Qalqala"],
    ["Tajweed 13: The Hams ", "The Hams"],
    ["Tajweed 14: Tajweed Homework 14 : Hamzah tul Wasl ", "Hamzah tul Wasl"],
    ["Tajweed 15: Tajweed Homework 15 : Meeting of 2 Sukoons ", "Meeting of 2 Sukoons"],
    ["Tajweed 16: Tajweed Homework 16 : Muduud Overview ", "Muduud Overview"],
    ["Tajweed 17: Tajweed Homework 17 : Mad ul Muttasil", "Mad ul Muttasil"],
    ["Tajweed 18: Madd Munfasil", "Madd Munfasil"],
    ["Tajweed 19: Maddul A’arid + Recitation Speeds", "Maddul A’arid + Recitation Speeds"],
    ["Tajweed 20: Tajweed Homework 20 : Madd Lazim", "Madd Lazim"],
    ["Tajweed 21: Waqf wa Ibtidah", "Waqf wa Ibtidah"],
    [
      "Umm al-Kitab 1 — Names, virtues and importance of Surah Al-Fatiha",
      "Names, virtues and importance of Surah Al-Fatiha",
    ],
    ["Umm al-Kitab 2 — Al-Isti'adha", "Al-Isti'adha"],
    ["Umm al-Kitab 3 — The Basmala", "The Basmala"],
    ["Umm al-Kitab 4 — Verse 2", "Verse 2"],
    ["Umm al-Kitab 9 — Verse 7", "Verse 7"],
  ])("reads the rule out of %j", (title, expected) => {
    expect(ruleName(title)).toBe(expected);
  });

  it.each([
    "The 10 Fundamental Principles: HW 1",
    "The 10 Fundamental Principles: HW 7",
  ])("returns null for %j, which names no rule", (title) => {
    expect(ruleName(title)).toBeNull();
  });

  it("returns null rather than an empty string", () => {
    expect(ruleName("")).toBeNull();
    expect(ruleName(null)).toBeNull();
    expect(ruleName("Tajweed 4:")).toBeNull();
    expect(ruleName("   ")).toBeNull();
  });

  it("strips at most two prefixes, so a rule may name its own course", () => {
    // "Tajweed 7: ... : Summary of ..." is two. A third would start eating
    // rules that legitimately begin with the word Tajweed.
    expect(ruleName("Tajweed 1: Tajweed Homework: Tajweed of the Qur'an")).toBe(
      "Tajweed of the Qur'an",
    );
  });

  it("leaves a title that carries no prefix alone", () => {
    expect(ruleName("Madd Munfasil")).toBe("Madd Munfasil");
  });
});
