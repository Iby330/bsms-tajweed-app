import { describe, it, expect } from "vitest";
import { fmtDay } from "./format";

describe("fmtDay", () => {
  it("formats a date column day-first, short month", () => {
    expect(fmtDay("2026-09-19")).toBe("19 Sept");
  });
  it("does not shift a date column west of UTC", () => {
    const prev = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      expect(fmtDay("2026-09-19")).toBe("19 Sept");
    } finally {
      process.env.TZ = prev;
    }
  });
});
