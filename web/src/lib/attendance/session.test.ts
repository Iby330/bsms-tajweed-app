import { describe, expect, it } from "vitest";
import { isoDate, sessionLabel } from "./session";

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
