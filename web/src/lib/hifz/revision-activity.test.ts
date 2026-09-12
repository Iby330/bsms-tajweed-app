import { describe, it, expect } from "vitest";
import {
  buildActivityGrid, collectDays, contributionLevel, dayKey, longestStreak, summarise,
  type RevisionDay,
} from "./revision-activity";

const day = (date: string, over: Partial<RevisionDay> = {}): RevisionDay =>
  ({ date, pages: 0, surahs: 0, sessions: 0, ...over });

describe("contributionLevel", () => {
  it("is empty only at zero, and saturates past four pages", () => {
    expect(contributionLevel(0)).toBe(0);
    expect(contributionLevel(1)).toBe(1);
    expect(contributionLevel(2)).toBe(2);
    expect(contributionLevel(4)).toBe(3);
    expect(contributionLevel(9)).toBe(4);
  });
});

describe("dayKey", () => {
  it("uses the LOCAL calendar day", () => {
    // 23:30 local on the 5th must file under the 5th. toISOString would push
    // this to the 6th for anyone east of UTC and the 5th→4th west of it.
    expect(dayKey(new Date(2026, 2, 5, 23, 30))).toBe("2026-03-05");
    expect(dayKey(new Date(2026, 0, 1, 0, 15))).toBe("2026-01-01");
  });
});

describe("collectDays", () => {
  const spans = { 112: 1, 96: 2 };
  it("converts sign-offs to page counts and merges sessions on the same day", () => {
    const out = collectDays(
      [{ surah_number: 112, passed_at: "2026-08-10" }, { surah_number: 96, passed_at: "2026-08-10" }],
      [{ submitted_at: new Date(2026, 7, 10, 9, 0).toISOString() }],
      spans,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ date: "2026-08-10", pages: 3, surahs: 2, sessions: 1 });
  });
  it("ignores a surah with no page data rather than counting it as a page", () => {
    const out = collectDays([{ surah_number: 2, passed_at: "2026-08-10" }], [], spans);
    expect(out[0]).toMatchObject({ surahs: 1, pages: 0 });
  });
  it("returns days in ascending date order", () => {
    const out = collectDays(
      [{ surah_number: 112, passed_at: "2026-08-12" }, { surah_number: 112, passed_at: "2026-08-01" }],
      [], spans,
    );
    expect(out.map((d) => d.date)).toEqual(["2026-08-01", "2026-08-12"]);
  });
});

describe("buildActivityGrid", () => {
  const end = new Date(2026, 7, 27); // Thursday 27 Aug 2026

  it("lays out week columns of seven rows, oldest first", () => {
    const grid = buildActivityGrid([], { end, weeks: 4 });
    expect(grid).toHaveLength(4);
    expect(grid[0].bins).toHaveLength(7);
    expect(grid[0].bins.map((b) => b.bin)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("starts the grid on the requested week start day", () => {
    const sunday = buildActivityGrid([], { end, weeks: 2, weekStartDay: 0 });
    expect(sunday[0].bins[0].date.getDay()).toBe(0);
    const monday = buildActivityGrid([], { end, weeks: 2, weekStartDay: 1 });
    expect(monday[0].bins[0].date.getDay()).toBe(1);
  });

  it("never renders past the end date — the last column is partial", () => {
    const grid = buildActivityGrid([], { end, weeks: 3 });
    const last = grid[grid.length - 1];
    // 27 Aug 2026 is a Thursday, so a Sunday-start week has Sun..Thu = 5 days
    expect(last.bins).toHaveLength(5);
    expect(last.bins.every((b) => b.date.getTime() <= end.getTime())).toBe(true);
  });

  it("places a day's pages on the right cell and leaves the rest empty", () => {
    const grid = buildActivityGrid([day("2026-08-25", { pages: 3, surahs: 1 })], { end, weeks: 2 });
    const hits = grid.flatMap((c) => c.bins).filter((b) => b.count > 0);
    expect(hits).toHaveLength(1);
    expect(dayKey(hits[0].date)).toBe("2026-08-25");
    expect(hits[0].count).toBe(contributionLevel(3));
    expect(hits[0].day?.surahs).toBe(1);
  });
});

describe("summarise / longestStreak", () => {
  it("totals pages, surahs, sessions and active days", () => {
    expect(summarise([
      day("2026-08-01", { pages: 2, surahs: 1 }),
      day("2026-08-02", { sessions: 1 }),
      day("2026-08-03"),
    ])).toEqual({ pages: 2, surahs: 1, sessions: 1, activeDays: 2 });
  });
  it("counts the longest unbroken run of active days", () => {
    expect(longestStreak([
      day("2026-08-01", { pages: 1 }),
      day("2026-08-02", { pages: 1 }),
      day("2026-08-03", { sessions: 1 }),
      day("2026-08-05", { pages: 1 }),   // gap on the 4th breaks the run
    ])).toBe(3);
  });
  it("is zero when nothing is active", () => {
    expect(longestStreak([day("2026-08-01")])).toBe(0);
  });
});
