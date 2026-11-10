import { describe, expect, it } from "vitest";
import {
  BAND_LABEL,
  BAND_TONE,
  BANDS,
  bandLimits,
  bandOf,
  DEFAULT_BAND_MINUTES,
  formatClock,
  formatLimit,
} from "./bands";

const MIN = 60_000;

describe("bandLimits", () => {
  it("scales the per-hizb minutes by the portion's size, in ms", () => {
    expect(bandLimits(1, DEFAULT_BAND_MINUTES)).toEqual({ ideal: 10 * MIN, good: 15 * MIN, acceptable: 20 * MIN });
    expect(bandLimits(6, DEFAULT_BAND_MINUTES)).toEqual({ ideal: 60 * MIN, good: 90 * MIN, acceptable: 120 * MIN });
  });

  it("gives a quarter a quarter of the hizb bands", () => {
    expect(bandLimits(0.25, DEFAULT_BAND_MINUTES)).toEqual({ ideal: 150_000, good: 225_000, acceptable: 300_000 });
  });

  it("rounds to whole ms rather than leaking float noise", () => {
    expect(bandLimits(0.3, DEFAULT_BAND_MINUTES).ideal).toBe(180_000);
  });

  it("follows the class's own minutes", () => {
    expect(bandLimits(2, { ideal: 12, good: 16, acceptable: 25 })).toEqual({ ideal: 24 * MIN, good: 32 * MIN, acceptable: 50 * MIN });
  });
});

describe("bandOf", () => {
  it("treats each edge as inside the band: exactly 10:00 on one hizb is ideal", () => {
    expect(bandOf(10 * MIN, 1, DEFAULT_BAND_MINUTES)).toBe("ideal");
    expect(bandOf(10 * MIN + 1, 1, DEFAULT_BAND_MINUTES)).toBe("good");
    expect(bandOf(15 * MIN, 1, DEFAULT_BAND_MINUTES)).toBe("good");
    expect(bandOf(15 * MIN + 1, 1, DEFAULT_BAND_MINUTES)).toBe("acceptable");
    expect(bandOf(20 * MIN, 1, DEFAULT_BAND_MINUTES)).toBe("acceptable");
    expect(bandOf(20 * MIN + 1, 1, DEFAULT_BAND_MINUTES)).toBe("slow");
  });

  it("is ideal at zero and uses the defaults when no minutes are given", () => {
    expect(bandOf(0, 1)).toBe("ideal");
    expect(bandOf(21 * MIN, 1)).toBe("slow");
  });

  it("bands on the portion's size", () => {
    // Juz 28-30 = 6 hizb: 59 minutes is still ideal.
    expect(bandOf(59 * MIN, 6, DEFAULT_BAND_MINUTES)).toBe("ideal");
    // A quarter at 2:31 is past its ideal 2:30.
    expect(bandOf(151_000, 0.25, DEFAULT_BAND_MINUTES)).toBe("good");
  });
});

describe("formatClock", () => {
  it("shows m:ss below an hour", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(999)).toBe("0:00");
    expect(formatClock(9 * MIN + 5_000)).toBe("9:05");
    expect(formatClock(59 * MIN + 59_999)).toBe("59:59");
  });

  it("shows h:mm:ss once past 59:59", () => {
    expect(formatClock(60 * MIN)).toBe("1:00:00");
    expect(formatClock(2 * 60 * MIN + 3 * MIN + 4_000)).toBe("2:03:04");
  });

  it("never shows a negative time", () => {
    expect(formatClock(-5_000)).toBe("0:00");
  });
});

describe("formatLimit", () => {
  it("reads a band's limit the way targets are written", () => {
    expect(formatLimit("ideal", 2 * 10 * MIN)).toBe("Ideal ≤ 20:00");
    expect(formatLimit("acceptable", 120 * MIN)).toBe("Acceptable ≤ 2:00:00");
  });
});

describe("labels and tones", () => {
  it("names the four bands, Ideal first, never gold", () => {
    expect(BANDS).toEqual(["ideal", "good", "acceptable", "slow"]);
    expect(BANDS.map((b) => BAND_LABEL[b])).toEqual(["Ideal", "Good", "Acceptable", "Too slow"]);
    expect(JSON.stringify(BAND_LABEL).toLowerCase()).not.toContain("gold");
  });

  it("colours from tokens only", () => {
    for (const b of BANDS) {
      expect(BAND_TONE[b].fill).toMatch(/var\(--(ok|warn|danger|card)\)/);
      expect(BAND_TONE[b].fill).not.toMatch(/#[0-9a-f]{3,6}/i);
    }
    expect(BAND_TONE.ideal.fill).toBe("var(--ok)");
    expect(BAND_TONE.slow.fill).toBe("var(--danger)");
  });
});
