import { describe, expect, it } from "vitest";
import { isoDate, londonDate, sessionLabel } from "./session";

describe("isoDate", () => {
  it("formats a date as YYYY-MM-DD in local time, not UTC", () => {
    // 00:30 local on 1 Aug must not slip back to 31 Jul via toISOString().
    expect(isoDate(new Date(2026, 7, 1, 0, 30))).toBe("2026-08-01");
  });

  it("zero-pads single-digit months and days", () => {
    expect(isoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("londonDate", () => {
  it("is already tomorrow at 00:30 BST, when UTC still says today", () => {
    // 23:30Z on 31 Jul is 00:30 on 1 Aug in London.
    expect(londonDate(new Date("2026-07-31T23:30:00Z"))).toBe("2026-08-01");
  });

  it("matches UTC in GMT, through the winter", () => {
    expect(londonDate(new Date("2026-01-05T23:30:00Z"))).toBe("2026-01-05");
    expect(londonDate(new Date("2026-01-06T00:30:00Z"))).toBe("2026-01-06");
  });

  it("turns over at London midnight either side of the clocks changing", () => {
    // BST ends 25 Oct 2026 at 01:00Z.
    expect(londonDate(new Date("2026-10-24T22:59:00Z"))).toBe("2026-10-24");
    expect(londonDate(new Date("2026-10-24T23:00:00Z"))).toBe("2026-10-25");
  });
});

describe("sessionLabel", () => {
  it("names each session by its subject, not its weekday", () => {
    expect(sessionLabel("tajweed")).toBe("Tajweed");
    expect(sessionLabel("hifdh")).toBe("Hifdh");
  });
});
