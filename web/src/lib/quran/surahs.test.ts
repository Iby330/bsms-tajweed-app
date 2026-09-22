import { describe, expect, it } from "vitest";
import { SURAHS, passageLabel, surahByNumber } from "./surahs";

describe("the surah table", () => {
  it("has all 114, numbered 1 to 114 in order", () => {
    expect(SURAHS).toHaveLength(114);
    expect(SURAHS.map((s) => s.number)).toEqual(
      Array.from({ length: 114 }, (_, i) => i + 1),
    );
  });

  /** The check that the generated table came down whole: the Hafs count. */
  it("totals 6,236 ayahs", () => {
    expect(SURAHS.reduce((n, s) => n + s.ayahs, 0)).toBe(6236);
  });

  it("knows the lengths that get checked by hand", () => {
    expect(surahByNumber(1)?.ayahs).toBe(7); // Al-Fatihah
    expect(surahByNumber(2)?.ayahs).toBe(286); // Al-Baqarah, the longest
    expect(surahByNumber(108)?.ayahs).toBe(3); // Al-Kawthar, the shortest
    expect(surahByNumber(114)?.name).toBe("An-Nas");
  });

  it("names every surah and gives each an Arabic name", () => {
    for (const s of SURAHS) {
      expect(s.name.length).toBeGreaterThan(1);
      // One character is legitimate here: Sad (38) is ص and Qaf (50) is ق.
      expect(s.nameAr.length).toBeGreaterThan(0);
      expect(s.ayahs).toBeGreaterThan(0);
    }
  });
});

describe("how a passage reads", () => {
  it("gives a range, or a single ayah", () => {
    expect(passageLabel(2, 255, 257)).toBe("Al-Baqarah 255 to 257");
    expect(passageLabel(2, 255, 255)).toBe("Al-Baqarah 255");
    expect(passageLabel(2, 255, null)).toBe("Al-Baqarah 255");
  });

  it("says nothing when nothing has been chosen", () => {
    expect(passageLabel(null, null, null)).toBeNull();
    expect(passageLabel(2, null, null)).toBeNull();
    expect(passageLabel(999, 1, 2)).toBeNull();
  });
});
