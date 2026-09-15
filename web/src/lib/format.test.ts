import { describe, it, expect, vi } from "vitest";
import { fmtDay, fmtStamp } from "./format";

describe("fmtDay", () => {
  it("formats a date column day-first, short month", () => {
    expect(fmtDay("2026-09-19")).toBe("19 Sept");
  });
  it("does not shift a date column west of UTC", async () => {
    const prev = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    vi.resetModules();
    try {
      const { fmtDay: freshFmtDay } = await import("./format");
      expect(freshFmtDay("2026-09-19")).toBe("19 Sept");
    } finally {
      process.env.TZ = prev;
      vi.resetModules();
    }
  });
});

describe("fmtStamp", () => {
  it("renders a timestamp in the school's zone, rolling into BST", () => {
    expect(fmtStamp("2026-07-01T23:30:00Z")).toBe("2 Jul");
  });
  it("does not roll a date column the same way", () => {
    expect(fmtDay("2026-07-01")).toBe("1 Jul");
  });
});
