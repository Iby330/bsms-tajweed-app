import { describe, it, expect } from "vitest";
import { SURAH_META } from "./surah-meta";

describe("SURAH_META", () => {
  it("covers every surah in the run (46 to 114, the last five ajza), nothing else", () => {
    const keys = Object.keys(SURAH_META).map(Number).sort((a, b) => a - b);
    expect(keys).toEqual(Array.from({ length: 69 }, (_, i) => 46 + i));
  });

  it("agrees with the full surah list on every ayah count", async () => {
    const { SURAHS } = await import("@/lib/quran/surahs");
    for (const [n, meta] of Object.entries(SURAH_META))
      expect(meta.ayahs).toBe(SURAHS.find((s) => s.number === Number(n))!.ayahs);
  });
  it("spot checks against the mushaf", () => {
    expect(SURAH_META[114]).toEqual({ ayahs: 6, meaning: "Mankind" });
    expect(SURAH_META[112]).toEqual({ ayahs: 4, meaning: "The Sincerity" });
    expect(SURAH_META[78]).toEqual({ ayahs: 40, meaning: "The Great News" });
    expect(SURAH_META[72]).toEqual({ ayahs: 28, meaning: "The Jinn" });
    // the floor moved to Al-Mulk so a student who finishes the year's target
    // has somewhere to continue
    expect(SURAH_META[67]).toEqual({ ayahs: 30, meaning: "The Sovereignty" });
  });
});
