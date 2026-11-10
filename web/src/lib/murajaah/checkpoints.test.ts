import { describe, expect, it } from "vitest";
import {
  ADDED_ORD_BASE,
  autoCheckpoints,
  finalStretch,
  nextAddedOrd,
  nextAutoOrd,
  stretchesOf,
} from "./checkpoints";
import { DEFAULT_BAND_MINUTES } from "./bands";

const MIN = 60_000;

describe("autoCheckpoints: one hizb", () => {
  it("is its four quarters, each banded at 0.25", () => {
    const cps = autoCheckpoints("hizb", [60]);
    expect(cps.map((c) => c.label)).toEqual([
      "Q1 · Al-A'la", "Q2 · Al-Balad", "Q3 · Ash-Sharh", "Q4 · Al-'Adiyat 9",
    ]);
    expect(cps.map((c) => c.ord)).toEqual([1, 2, 3, 4]);
    expect(cps.map((c) => c.short)).toEqual(["Q1", "Q2", "Q3", "Q4"]);
    expect(cps[1].tag).toBe("Al-Balad");
    expect(cps[1].sub).toBe("90:1 · page 594");
    expect(cps.every((c) => c.scale === 0.25)).toBe(true);
    expect(cps[0].nextPage).toBe(594);
    expect(cps[3].nextPage).toBeNull();
  });

  it("ends after Q4 with no band of its own", () => {
    expect(finalStretch("hizb", [60])).toEqual({
      label: "After Q4", sub: "time between the Q4 tick and Finish", scale: null,
    });
  });
});

describe("autoCheckpoints: one juz", () => {
  it("is one checkpoint, the end of its first hizb, ticked on reaching the second", () => {
    const cps = autoCheckpoints("juz", [30]);
    expect(cps).toHaveLength(1);
    expect(cps[0]).toMatchObject({
      ord: 1, label: "End of Hizb 59", short: "H59", tag: "to Al-A'la",
      sub: "next: Al-A'la 1 (p591)", scale: 1, page: 582, nextPage: 591,
    });
    expect(finalStretch("juz", [30])).toEqual({ label: "Hizb 60", sub: "last hizb, ends at Finish", scale: 1 });
  });
});

describe("autoCheckpoints: several hizb", () => {
  it("ends each hizb except the last", () => {
    const cps = autoCheckpoints("hizb", [57, 58, 59]);
    expect(cps.map((c) => c.label)).toEqual(["End of Hizb 57", "End of Hizb 58"]);
    expect(cps[0].sub).toBe("next: Al-Jinn 1 (p572)");
    expect(cps[0].tag).toBe("to Al-Jinn");
    expect(finalStretch("hizb", [57, 58, 59])?.label).toBe("Hizb 59");
  });

  it("names a gap", () => {
    expect(autoCheckpoints("hizb", [55, 57]).map((c) => c.label)).toEqual(["End of Hizb 55, then Hizb 57"]);
  });
});

describe("autoCheckpoints: several juz", () => {
  it("ends every hizb except the last: 3 juz give 5", () => {
    const cps = autoCheckpoints("juz", [28, 29, 30]);
    expect(cps.map((c) => c.label)).toEqual([
      "End of Hizb 55", "End of Hizb 56", "End of Hizb 57", "End of Hizb 58", "End of Hizb 59",
    ]);
    expect(cps.map((c) => c.ord)).toEqual([1, 2, 3, 4, 5]);
    expect(cps[0].sub).toBe("next: Al-Jumu'ah 1 (p553)");
  });

  it("names a gap between juz", () => {
    const cps = autoCheckpoints("juz", [28, 30]);
    expect(cps.map((c) => c.label)).toEqual([
      "End of Hizb 55", "End of Juz 28, then Juz 30", "End of Hizb 59",
    ]);
    expect(cps[1]).toMatchObject({ short: "H56", tag: "to An-Naba", sub: "next: An-Naba 1 (p582)", nextPage: 582 });
  });
});

describe("autoCheckpoints: surahs", () => {
  it("has none for one surah, which ends at Finish on its own size", () => {
    expect(autoCheckpoints("surah", [67])).toEqual([]);
    expect(finalStretch("surah", [67])).toEqual({ label: "Al-Mulk", sub: "ends at Finish", scale: 0.3 });
  });

  it("ends each surah except the last, banded on its own pages", () => {
    const cps = autoCheckpoints("surah", [67, 68, 69]);
    expect(cps.map((c) => c.label)).toEqual(["End of Al-Mulk", "End of Al-Qalam"]);
    expect(cps[0]).toMatchObject({ short: "S67", tag: "Al-Mulk", sub: "next: Al-Qalam 1 (p564)", scale: 0.3 });
    expect(finalStretch("surah", [67, 68, 69])).toEqual({ label: "Al-Haqqah", sub: "last surah, ends at Finish", scale: 0.3 });
  });

  it("names a gap between surahs", () => {
    expect(autoCheckpoints("surah", [67, 69]).map((c) => c.label)).toEqual(["End of Al-Mulk, then Al-Haqqah"]);
  });
});

describe("ords", () => {
  it("ticks auto checkpoints in order", () => {
    expect(nextAutoOrd(3, [])).toBe(1);
    expect(nextAutoOrd(3, [1, 2])).toBe(3);
    expect(nextAutoOrd(3, [1, 2, 3])).toBeNull();
  });

  it("numbers added checkpoints from 1001, past any already there", () => {
    expect(ADDED_ORD_BASE).toBe(1000);
    expect(nextAddedOrd([])).toBe(1001);
    expect(nextAddedOrd([1, 2, 1001, 1003])).toBe(1004);
  });
});

describe("stretchesOf", () => {
  it("bands each auto stretch on its own size and counts its mistakes", () => {
    // Juz 28 + 30: three auto checkpoints, a stretch each, then the last hizb.
    const s = stretchesOf({
      kind: "juz", ns: [28, 30],
      ticked: [
        { kind: "auto", ord: 1, label: "End of Hizb 55", atMs: 9 * MIN },
        { kind: "auto", ord: 2, label: "End of Juz 28, then Juz 30", atMs: 25 * MIN },
      ],
      markAts: [0, 9 * MIN, 9 * MIN + 1, 30 * MIN],
      endMs: 40 * MIN,
      minutes: DEFAULT_BAND_MINUTES,
    });
    expect(s.map((x) => [x.kind, x.ms, x.band, x.mistakes])).toEqual([
      ["auto", 9 * MIN, "ideal", 2],
      ["auto", 16 * MIN, "acceptable", 1],
      // Two hizb left unticked (59 and 60): scale 2, so 15:00 is ideal.
      ["final", 15 * MIN, "ideal", 1],
    ]);
    expect(s[2]).toMatchObject({ fromMs: 25 * MIN, toMs: 40 * MIN, scale: 2, label: "To Finish" });
  });

  it("gives an added checkpoint no band, measured from the previous point of any kind", () => {
    const s = stretchesOf({
      kind: "surah", ns: [67],
      ticked: [
        { kind: "added", ord: 1001, label: "Checkpoint 1", atMs: 2 * MIN },
        { kind: "added", ord: 1002, label: "Checkpoint 2", atMs: 5 * MIN },
      ],
      markAts: [1 * MIN, 3 * MIN, 4 * MIN],
      endMs: 6 * MIN,
      minutes: DEFAULT_BAND_MINUTES,
    });
    expect(s.map((x) => [x.kind, x.label, x.fromMs, x.ms, x.band, x.mistakes])).toEqual([
      ["added", "Checkpoint 1", 0, 2 * MIN, null, 1],
      ["added", "Checkpoint 2", 2 * MIN, 3 * MIN, null, 2],
      // The whole surah, 0.3 hizb: Good ends at 4:30 and Acceptable at exactly 6:00.
      ["final", "Al-Mulk", 0, 6 * MIN, "acceptable", 3],
    ]);
  });

  it("ends a fully ticked hizb with an unbanded rest", () => {
    const ticked = [1, 2, 3, 4].map((ord) => ({ kind: "auto" as const, ord, label: `Q${ord}`, atMs: ord * 2 * MIN }));
    const s = stretchesOf({ kind: "hizb", ns: [60], ticked, markAts: [], endMs: 8 * MIN + 5_000, minutes: DEFAULT_BAND_MINUTES });
    expect(s.map((x) => x.band)).toEqual(["ideal", "ideal", "ideal", "ideal", null]);
    expect(s[4]).toMatchObject({ kind: "final", label: "After Q4", ms: 5_000, scale: null });
  });

  it("leaves out the final stretch before Finish", () => {
    const s = stretchesOf({
      kind: "hizb", ns: [57, 58],
      ticked: [{ kind: "auto", ord: 1, label: "End of Hizb 57", atMs: MIN }],
      markAts: [], endMs: null, minutes: DEFAULT_BAND_MINUTES,
    });
    expect(s.map((x) => x.kind)).toEqual(["auto"]);
  });

  it("sorts ticks by time whatever order they arrive in", () => {
    const s = stretchesOf({
      kind: "hizb", ns: [57, 58, 59],
      ticked: [
        { kind: "auto", ord: 2, label: "End of Hizb 58", atMs: 20 * MIN },
        { kind: "auto", ord: 1, label: "End of Hizb 57", atMs: 10 * MIN },
      ],
      markAts: [], endMs: null, minutes: DEFAULT_BAND_MINUTES,
    });
    expect(s.map((x) => x.ms)).toEqual([10 * MIN, 10 * MIN]);
  });
});
