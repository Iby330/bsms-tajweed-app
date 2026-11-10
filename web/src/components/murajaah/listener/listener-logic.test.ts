import { describe, expect, it } from "vitest";
import {
  allowedCategories, bandBar, checkpointRows, dimHeat, isDirty, latestMark, limitLine,
  locationOf, markAt, markMap, pageRangeOf, shortcutOf, surahMatches, timeHint, toggleUnit,
} from "./listener-logic";
import { DEFAULT_BAND_MINUTES } from "@/lib/murajaah/bands";
import { NEW_CLOCK } from "@/lib/murajaah/clock";
import { rangesOf, surahInfo } from "@/lib/murajaah/portions";
import type { CheckpointView, MarkView } from "@/lib/murajaah/sessions";
import { groupIntoPages, type QuranWord } from "@/lib/quran/mushaf";

const MIN = 60_000;
const mark = (over: Partial<MarkView>): MarkView => ({
  id: "m", atMs: 0, surah: null, ayah: null, position: null, category: null, ...over,
});
const cp = (over: Partial<CheckpointView>): CheckpointView => ({
  id: "c", kind: "auto", ord: 1, label: "", atMs: 0, ...over,
});
const word = (over: Partial<QuranWord>): QuranWord => ({
  surah: 86, ayah: 17, position: 1, text: "x", glyph: null, isEnd: false, page: 591, line: 1, ...over,
});

describe("pageRangeOf", () => {
  it("runs from the first unit's page to where the last one ends", () => {
    expect(pageRangeOf("hizb", [60])).toEqual({ first: 591, last: 604 });
    expect(pageRangeOf("juz", [29])).toEqual({ first: 562, last: 582 });
    expect(pageRangeOf("hizb", [58])).toEqual({ first: 572, last: 582 });
  });
  it("takes a surah's own last page, and spans gaps", () => {
    expect(pageRangeOf("surah", [67])).toEqual({ first: 562, last: surahInfo(67).pages[1] });
    expect(pageRangeOf("surah", [67, 78])).toEqual({ first: 562, last: surahInfo(78).pages[1] });
  });
});

describe("dimHeat", () => {
  it("dims and disables every ayah outside the selection, by ayah key", () => {
    const pages = groupIntoPages([
      word({ surah: 86, ayah: 17 }),
      word({ surah: 87, ayah: 1, position: 1 }),
      word({ surah: 87, ayah: 1, position: 2, isEnd: true }),
    ]);
    const heat = dimHeat(pages, rangesOf("hizb", [60]));
    expect(Object.keys(heat)).toEqual(["86:17"]);
    expect(heat["86:17"]).toMatch(/opacity/);
    expect(heat["86:17"]).toMatch(/pointer-events-none/);
  });
});

describe("marks", () => {
  it("a word tap targets the word; the end marker the whole ayah", () => {
    expect(locationOf(word({ position: 3 }))).toEqual({ surah: 86, ayah: 17, position: 3 });
    expect(locationOf(word({ position: 5, isEnd: true }))).toEqual({ surah: 86, ayah: 17, position: null });
  });
  it("finds the mark already on a target, never a +1", () => {
    const ms = [
      mark({ id: "p" }),
      mark({ id: "w", surah: 1, ayah: 2, position: 3 }),
      mark({ id: "a", surah: 1, ayah: 2, position: null }),
    ];
    expect(markAt(ms, { surah: 1, ayah: 2, position: 3 })?.id).toBe("w");
    expect(markAt(ms, { surah: 1, ayah: 2, position: null })?.id).toBe("a");
    expect(markAt(ms, { surah: 1, ayah: 2, position: 4 })).toBeUndefined();
  });
  it("tints by markKey, skipping +1 marks", () => {
    const map = markMap([
      mark({ id: "p" }),
      mark({ id: "w", surah: 1, ayah: 2, position: 3 }),
      mark({ id: "a", surah: 1, ayah: 4, position: null }),
    ]);
    expect(Object.keys(map).sort()).toEqual(["1:2:3", "1:4"]);
  });
  it("undo takes the most recently added mark of either kind", () => {
    expect(latestMark([])).toBeNull();
    expect(latestMark([mark({ id: "a", atMs: 5 }), mark({ id: "b", atMs: 5 })])?.id).toBe("b");
  });
  it("offers makhraj for a word or a +1, never a whole ayah", () => {
    expect(allowedCategories(mark({ surah: 1, ayah: 1, position: 2 }))).toContain("makhraj");
    expect(allowedCategories(mark({}))).toContain("makhraj");
    expect(allowedCategories(mark({ surah: 1, ayah: 1, position: null }))).toEqual(["hifz", "tajweed", "fluency"]);
  });
});

describe("isDirty", () => {
  it("is true once the clock has started or anything is marked or ticked", () => {
    expect(isDirty(NEW_CLOCK, [], [])).toBe(false);
    expect(isDirty({ ...NEW_CLOCK, timer_started_at: "2026-01-01T00:00:00Z" }, [], [])).toBe(true);
    expect(isDirty(NEW_CLOCK, [mark({})], [])).toBe(true);
    expect(isDirty(NEW_CLOCK, [], [cp({})])).toBe(true);
  });
});

describe("checkpointRows", () => {
  const base = { kind: "juz" as const, ns: [29, 30], minutes: DEFAULT_BAND_MINUTES, markAts: [] as number[] };
  it("lists pending checkpoints with the first one next, timing it live", () => {
    const rows = checkpointRows({ ...base, checkpoints: [], nowMs: 4 * MIN, started: true });
    expect(rows.map((r) => r.state)).toEqual(["next", "pending", "pending"]);
    expect(rows[0]).toMatchObject({ short: "H57", liveMs: 4 * MIN, band: "ideal" });
  });
  it("shows done ones first with their split, band and mistakes; only the latest auto can untick", () => {
    const rows = checkpointRows({
      ...base,
      checkpoints: [
        cp({ id: "a1", ord: 1, label: "End of Hizb 57", atMs: 12 * MIN }),
        cp({ id: "x", kind: "added", ord: 1001, label: "Checkpoint 1", atMs: 15 * MIN }),
        cp({ id: "a2", ord: 2, label: "End of Hizb 58", atMs: 30 * MIN }),
      ],
      markAts: [1 * MIN, 13 * MIN, 16 * MIN],
      nowMs: 31 * MIN,
      started: true,
    });
    expect(rows.map((r) => [r.state, r.id])).toEqual([
      ["done", "a1"], ["done", "x"], ["done", "a2"], ["next", null],
    ]);
    expect(rows[0]).toMatchObject({ splitMs: 12 * MIN, band: "good", mistakes: 1, canUntick: false });
    expect(rows[1]).toMatchObject({ splitMs: 3 * MIN, band: null, mistakes: 1, canUntick: true, short: "CP1" });
    expect(rows[2]).toMatchObject({ splitMs: 18 * MIN, band: "acceptable", mistakes: 2, canUntick: true });
    expect(rows[3]).toMatchObject({ liveMs: 1 * MIN });
  });
  it("has nothing for one surah", () => {
    expect(checkpointRows({ ...base, kind: "surah", ns: [67], checkpoints: [], nowMs: 0, started: false })).toEqual([]);
  });
});

describe("bandBar", () => {
  it("splits the bar ideal : good : acceptable : slow, and places the marker", () => {
    const b = bandBar(10 * MIN, 1, DEFAULT_BAND_MINUTES);
    expect(b.widths).toEqual([40, 20, 20, 20]);
    expect(b.markerPct).toBe(40);
    expect(b.ticks).toEqual(["10:00", "15:00", "20:00"]);
    expect(bandBar(99 * MIN, 1, DEFAULT_BAND_MINUTES).markerPct).toBe(100);
  });
  it("scales its ticks to the selection", () => {
    expect(bandBar(0, 4, DEFAULT_BAND_MINUTES).ticks).toEqual(["40:00", "1:00:00", "1:20:00"]);
  });
});

describe("timeHint", () => {
  it("says how long is left in the band", () => {
    expect(timeHint(4 * MIN, 1, DEFAULT_BAND_MINUTES)).toBe("Ideal until 10:00 · 6:00 left");
    expect(timeHint(12 * MIN, 1, DEFAULT_BAND_MINUTES)).toBe("Good until 15:00 · 3:00 left");
    expect(timeHint(21 * MIN, 1, DEFAULT_BAND_MINUTES)).toBe("Past 20:00: too slow");
  });
});

describe("limitLine", () => {
  it("reads the inclusive limit", () => {
    expect(limitLine(3)).toBe("3 mistakes or fewer");
    expect(limitLine(1)).toBe("1 mistake or fewer");
    expect(limitLine(0)).toBe("no mistakes");
  });
});

describe("toggleUnit", () => {
  it("toggles within a kind and keeps it sorted", () => {
    expect(toggleUnit({ kind: "juz", ns: [30] }, "juz", 28).sel).toEqual({ kind: "juz", ns: [28, 30] });
    expect(toggleUnit({ kind: "juz", ns: [28, 30] }, "juz", 28).sel).toEqual({ kind: "juz", ns: [30] });
  });
  it("starts a new selection in another kind, and says so", () => {
    const r = toggleUnit({ kind: "juz", ns: [30] }, "hizb", 5);
    expect(r.sel).toEqual({ kind: "hizb", ns: [5] });
    expect(r.msg).toBe("New hizb selection: your juz selection was cleared.");
    expect(toggleUnit({ kind: "juz", ns: [] }, "hizb", 5).msg).toBe("");
  });
});

describe("surahMatches", () => {
  const mulk = { n: 67, en: "Al-Mulk", ar: "الملك" };
  it("matches by number prefix, English name with or without the article, or Arabic", () => {
    expect(surahMatches(mulk, "")).toBe(true);
    expect(surahMatches(mulk, "67")).toBe(true);
    expect(surahMatches(mulk, "7")).toBe(false);
    expect(surahMatches(mulk, "mulk")).toBe(true);
    expect(surahMatches(mulk, "al-mu")).toBe(true);
    expect(surahMatches(mulk, "الملك")).toBe(true);
    expect(surahMatches(mulk, "naba")).toBe(false);
  });
});

describe("shortcutOf", () => {
  it("maps the rail's keys", () => {
    expect(shortcutOf(" ")).toBe("plus");
    expect(shortcutOf("m")).toBe("plus");
    expect(shortcutOf("M")).toBe("plus");
    expect(shortcutOf("z")).toBe("undo");
    expect(shortcutOf("p")).toBe("startPause");
    expect(shortcutOf("n")).toBe("tick");
    expect(shortcutOf("c")).toBe("addCheckpoint");
    expect(shortcutOf("ArrowLeft")).toBe("nextPage");
    expect(shortcutOf("ArrowRight")).toBe("prevPage");
    expect(shortcutOf("q")).toBeNull();
  });
});
