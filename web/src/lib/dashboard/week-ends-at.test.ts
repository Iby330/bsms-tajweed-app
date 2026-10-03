import { describe, it, expect } from "vitest";
import { currentWeek, weekEndsAt } from "./queries";

// 2026/27 as it went live: 0050 brought week 1 forward to Saturday 00:00 UK,
// while week 2 kept its Thursday 13:00 release (0042). Five and a half days.
const weeks = [
  { id: "w1", unlock_at: "2026-10-02T23:00:00+00:00" },
  { id: "w2", unlock_at: "2026-10-08T12:00:00+00:00" },
  { id: "w3", unlock_at: "2026-10-15T12:00:00+00:00" },
];
const saturday = new Date("2026-10-03T10:00:00Z");

describe("weekEndsAt", () => {
  /**
   * The teacher's "This week" ran a fixed seven days from week 1's opening,
   * to the Saturday after — so week 2's homework, out on the Thursday, was
   * listed as this week's from the day term started.
   */
  it("ends a short week where the next one opens, not seven days on", () => {
    const week = currentWeek(weeks, saturday)!;
    expect(week.id).toBe("w1");
    expect(weekEndsAt(weeks, week)).toBe(Date.parse("2026-10-08T12:00:00Z"));
  });

  it("ends an ordinary week a week later, at the next Thursday", () => {
    expect(weekEndsAt(weeks, weeks[1])).toBe(Date.parse("2026-10-15T12:00:00Z"));
  });

  it("gives the last week on the calendar seven days", () => {
    expect(weekEndsAt(weeks, weeks[2])).toBe(Date.parse("2026-10-22T12:00:00Z"));
  });
});
