import { describe, it, expect } from "vitest";
import { classVerse } from "./verse";

const NAMED = ["Rayyan", "Hareer", "Salsabeel", "Zukhruf"];

describe("classVerse", () => {
  it("has a passage for every class named out of a text", () => {
    for (const n of NAMED) expect(classVerse(n), n).not.toBeNull();
  });

  it("has none for a class named after a place", () => {
    for (const n of ["Masjid Al-Haram", "Masjid An-Nabawi", "Masjid Al-Aqsa"]) {
      expect(classVerse(n), n).toBeNull();
    }
  });

  /**
   * The highlight is a substring match, so a diacritic that drifts between the
   * word and the line costs the reader the highlight and says nothing — the
   * component falls back to plain text rather than throwing. This is the test
   * that notices.
   */
  it("carries each class's own word exactly as it appears in the line", () => {
    for (const n of NAMED) {
      const v = classVerse(n)!;
      expect(v.ar, `${n} arabic`).toContain(v.arWord);
      expect(v.en, `${n} english`).toContain(v.enWord);
    }
  });

  it("matches the class name however it is cased or spaced", () => {
    expect(classVerse("  hareer  ")).toEqual(classVerse("Hareer"));
    expect(classVerse("SALSABEEL")).toEqual(classVerse("Salsabeel"));
  });

  it("is null rather than throwing when a student has no class", () => {
    expect(classVerse(null)).toBeNull();
    expect(classVerse(undefined)).toBeNull();
    expect(classVerse("")).toBeNull();
  });

  it("names its source", () => {
    expect(classVerse("Salsabeel")!.source).toBe("Al-Insān 76:17–18");
    expect(classVerse("Rayyan")!.source).toContain("Muslim");
  });
});
