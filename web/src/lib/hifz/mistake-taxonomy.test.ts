import { describe, it, expect } from "vitest";
import {
  CATEGORIES, DETAILS, SESSION_FLAGS, detailLabel, flagLabel, lettersOf,
} from "./mistake-taxonomy";

describe("taxonomy shape", () => {
  it("has the three selectable categories", () => {
    expect(CATEGORIES.map((c) => c.id)).toEqual(["hifz", "tajweed", "makhraj"]);
  });
  it("gives every non-makhraj category a detail list", () => {
    expect(DETAILS.hifz.length).toBeGreaterThan(0);
    expect(DETAILS.tajweed.map((d) => d.id)).toContain("ikhfa");
  });
  it("has session flags including weak hifz", () => {
    expect(SESSION_FLAGS.map((f) => f.id)).toContain("weak_hifz");
  });
  // Fluency was retired from the picker; rows already logged under it must
  // still read properly rather than showing the raw slug to a student.
  it("still labels a retired category's rows", () => {
    expect(CATEGORIES.map((c) => c.id)).not.toContain("fluency");
    expect(detailLabel("fluency", "hesitation")).toBe("Fluency — Hesitation");
  });
});

describe("lettersOf", () => {
  it("strips diacritics down to base letters", () => {
    expect(lettersOf("قُلْ")).toEqual(["ق", "ل"]);
  });
  it("normalises alif variants and dedupes", () => {
    expect(lettersOf("ٱلنَّاسِ")).toEqual(["ا", "ل", "ن", "س"]);
  });
  it("returns nothing for ayah-end numerals", () => {
    expect(lettersOf("١")).toEqual([]);
  });
});

describe("labels", () => {
  it("labels a tajweed rule", () => {
    expect(detailLabel("tajweed", "ikhfa")).toBe("Tajweed — Ikhfa");
  });
  it("labels a makhraj letter with the letter itself", () => {
    expect(detailLabel("makhraj", "ض")).toBe("Makhraj of ض");
  });
  it("falls back to the category for null detail", () => {
    expect(detailLabel("hifz", null)).toBe("Hifdh");
  });
  it("labels flags", () => {
    expect(flagLabel("weak_hifz")).toBe("Weak hifdh overall");
  });
});
