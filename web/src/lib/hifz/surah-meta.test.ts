import { describe, it, expect } from "vitest";
import { SURAH_META } from "./surah-meta";

describe("SURAH_META", () => {
  it("covers every surah in the run (67 to 114), nothing else", () => {
    const keys = Object.keys(SURAH_META).map(Number).sort((a, b) => a - b);
    expect(keys).toEqual(Array.from({ length: 48 }, (_, i) => 67 + i));
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
