import { describe, expect, it } from "vitest";
import { chartBars, chartViews, type ChartSession } from "./chart-data";
import { DEFAULT_CLASS_TARGET } from "./targets";
import { clockPhase } from "./clock";

const MIN = 60_000;
let seq = 0;
function s(kind: ChartSession["kind"], ns: number[], label: string, hizbEq: number, ms: number, day: number, mistakes = 0): ChartSession {
  seq += 1;
  const at = `2026-11-${String(day).padStart(2, "0")}T18:00:00.000Z`;
  return {
    id: `s${seq}`, kind, ns, label, hizbEq, mistakes,
    clock: { elapsed_ms: ms, running_since: null, timer_started_at: at, finished_at: at },
    createdAt: at, submittedAt: at,
  };
}

describe("chartViews", () => {
  it("offers All juz and All hizb when present, then each portion, newest first, and defaults to All juz", () => {
    const list = [
      s("hizb", [60], "Hizb 60", 1, 9 * MIN, 1),
      s("juz", [30], "Juz 30", 2, 19 * MIN, 2),
      s("surah", [67], "Surah Al-Mulk", 0.3, 3 * MIN, 3),
      s("hizb", [60], "Hizb 60", 1, 8 * MIN, 4),
    ];
    const { views, defaultId } = chartViews(list);
    expect(views.map((v) => [v.id, v.name, v.count])).toEqual([
      ["all-juz", "All juz", 1],
      ["all-hizb", "All hizb", 2],
      ["Hizb 60", "Hizb 60", 2],
      ["Surah Al-Mulk", "Surah Al-Mulk", 1],
      ["Juz 30", "Juz 30", 1],
    ]);
    expect(defaultId).toBe("all-juz");
  });

  it("defaults to All hizb without juz, and to the latest label with neither", () => {
    expect(chartViews([s("hizb", [1], "Hizb 1", 1, MIN, 1)]).defaultId).toBe("all-hizb");
    const surahs = [s("surah", [67], "Surah Al-Mulk", 0.3, MIN, 1), s("surah", [68], "Surah Al-Qalam", 0.3, MIN, 2)];
    const { views, defaultId } = chartViews(surahs);
    expect(defaultId).toBe("Surah Al-Qalam");
    expect(views.some((v) => v.id === "all-surah")).toBe(false);
  });

  it("ignores drafts and is empty with nothing saved", () => {
    const draft = { ...s("juz", [1], "Juz 1", 2, MIN, 1), submittedAt: null };
    expect(chartViews([draft])).toEqual({ views: [], defaultId: null });
    expect(clockPhase(draft.clock)).toBe("finished");
  });
});

describe("chartBars", () => {
  it("shows a single portion on its own size, in date order", () => {
    const list = [
      s("juz", [28, 30], "Juz 28 + 30", 4, 50 * MIN, 5, 12),
      s("juz", [28, 30], "Juz 28 + 30", 4, 38 * MIN, 2, 3),
    ];
    const { bars, refLines, perUnit } = chartBars(list, "Juz 28 + 30", DEFAULT_CLASS_TARGET);
    expect(perUnit).toBeNull();
    expect(refLines).toEqual({ ideal: 40 * MIN, good: 60 * MIN, acceptable: 80 * MIN });
    expect(bars.map((b) => [b.valueMs, b.totalMs, b.band, b.mistakes, b.limit, b.perUnit])).toEqual([
      [38 * MIN, 38 * MIN, "ideal", 3, 10, null],
      [50 * MIN, 50 * MIN, "good", 12, 10, null],
    ]);
    expect(bars[0].date).toBe("2026-11-02T18:00:00.000Z");
    expect(bars[0].label).toBe("Juz 28 + 30");
  });

  it("divides a multi-unit attempt per unit in All juz, banded on one juz", () => {
    const list = [
      s("juz", [30], "Juz 30", 2, 19 * MIN, 1),
      s("juz", [28, 30], "Juz 28 + 30", 4, 50 * MIN, 2),
      s("hizb", [60], "Hizb 60", 1, 9 * MIN, 3),
    ];
    const { bars, refLines, perUnit } = chartBars(list, "all-juz", DEFAULT_CLASS_TARGET);
    expect(perUnit).toBe("juz");
    expect(refLines).toEqual({ ideal: 20 * MIN, good: 30 * MIN, acceptable: 40 * MIN });
    expect(bars.map((b) => [b.label, b.valueMs, b.totalMs, b.band, b.perUnit])).toEqual([
      ["Juz 30", 19 * MIN, 19 * MIN, "ideal", "juz"],
      ["Juz 28 + 30", 25 * MIN, 50 * MIN, "good", "juz"],
    ]);
  });

  it("does All hizb the same way", () => {
    const { bars, refLines } = chartBars(
      [s("hizb", [57, 58, 59], "Hizb 57–59", 3, 45 * MIN, 1), s("juz", [30], "Juz 30", 2, MIN, 2)],
      "all-hizb", DEFAULT_CLASS_TARGET,
    );
    expect(refLines.ideal).toBe(10 * MIN);
    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({ valueMs: 15 * MIN, totalMs: 45 * MIN, band: "good", limit: 9 });
  });

  it("reads against the class's current targets and the student's override", () => {
    const target = { minutes: { ideal: 12, good: 16, acceptable: 22 }, limits: { hizb: 2, juz: 4, surah10: 3 } };
    const { bars, refLines } = chartBars([s("juz", [30], "Juz 30", 2, 23 * MIN, 1)], "all-juz", target, { hizb: null, juz: 6, surah10: null });
    expect(refLines.ideal).toBe(24 * MIN);
    expect(bars[0]).toMatchObject({ band: "ideal", limit: 6 });
  });

  it("is empty for an unknown view", () => {
    expect(chartBars([s("juz", [30], "Juz 30", 2, MIN, 1)], "Hizb 9", DEFAULT_CLASS_TARGET).bars).toEqual([]);
  });
});
