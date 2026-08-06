import { describe, expect, it } from "vitest";
import { defaultSessionFor, isoDate, sessionLabel } from "./session";

describe("defaultSessionFor", () => {
  it.each([
    ["Monday", "2026-07-27", "monday"],
    ["Tuesday", "2026-07-28", "monday"],
    ["Wednesday", "2026-07-29", "monday"],
    ["Thursday", "2026-07-30", "thursday"],
    ["Friday", "2026-07-31", "thursday"],
    ["Saturday", "2026-08-01", "thursday"],
    ["Sunday", "2026-08-02", "thursday"],
  ])("picks the nearest session for a %s", (_day, date, expected) => {
    expect(defaultSessionFor(date)).toBe(expected);
  });

  it("defaults to the Monday session for an unparseable date", () => {
    expect(defaultSessionFor("not-a-date")).toBe("monday");
  });
});

describe("isoDate", () => {
  it("formats a date as YYYY-MM-DD in local time, not UTC", () => {
    // 00:30 local on 1 Aug must not slip back to 31 Jul via toISOString().
    expect(isoDate(new Date(2026, 7, 1, 0, 30))).toBe("2026-08-01");
  });

  it("zero-pads single-digit months and days", () => {
    expect(isoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("sessionLabel", () => {
  it("names each session", () => {
    expect(sessionLabel("monday")).toBe("Monday");
    expect(sessionLabel("thursday")).toBe("Thursday");
  });
});
