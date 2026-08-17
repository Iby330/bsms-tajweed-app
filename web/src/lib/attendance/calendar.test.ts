import { describe, expect, it } from "vitest";
import {
  HOLIDAYS,
  YEAR_END,
  YEAR_START,
  holidayReason,
  isSessionDate,
  nearestSessionDate,
  nextSessionDate,
  previousSessionDate,
  sessionDates,
  sessionTypeFor,
} from "./calendar";

describe("sessionDates", () => {
  const dates = sessionDates();

  it("runs from the first Monday to the last Thursday of the year", () => {
    expect(dates[0]).toBe(YEAR_START);
    // 28 May 2027 is a Friday, so the year's last class is the Thursday before.
    expect(dates[dates.length - 1]).toBe("2027-05-27");
  });

  it("never runs past the end of the year", () => {
    expect(dates[dates.length - 1] <= YEAR_END).toBe(true);
  });

  it("is 68 sessions — 34 Mondays and 34 Thursdays", () => {
    const days = dates.map((d) => new Date(`${d}T12:00:00`).getDay());
    expect(days.filter((d) => d === 1)).toHaveLength(34);
    expect(days.filter((d) => d === 4)).toHaveLength(34);
    expect(dates).toHaveLength(68);
  });

  it("contains nothing but Mondays and Thursdays", () => {
    const other = dates.filter((d) => ![1, 4].includes(new Date(`${d}T12:00:00`).getDay()));
    expect(other).toEqual([]);
  });

  it("is ascending and free of duplicates", () => {
    expect([...dates].sort()).toEqual([...dates]);
    expect(new Set(dates).size).toBe(dates.length);
  });

  it("skips every date listed as a holiday", () => {
    for (const iso of Object.keys(HOLIDAYS)) expect(dates).not.toContain(iso);
  });

  it("returns the same array on repeat calls rather than rebuilding it", () => {
    expect(sessionDates()).toBe(dates);
  });
});

describe("isSessionDate", () => {
  it.each([
    ["a term-time Monday", "2026-10-05"],
    ["a term-time Thursday", "2026-10-08"],
  ])("accepts %s", (_what, iso) => {
    expect(isSessionDate(iso)).toBe(true);
  });

  it.each([
    ["a Tuesday", "2026-10-06"],
    ["a Wednesday", "2026-10-07"],
    ["a weekend", "2026-10-10"],
    ["a Monday before the year opens", "2026-09-28"],
    ["a Monday after the year closes", "2027-05-31"],
    ["a date that isn't a date", "not-a-date"],
    ["an impossible day", "2027-02-31"],
  ])("rejects %s", (_what, iso) => {
    expect(isSessionDate(iso)).toBe(false);
  });
});

describe("sessionTypeFor", () => {
  it("reads the session straight off the date", () => {
    expect(sessionTypeFor("2026-10-05")).toBe("monday");
    expect(sessionTypeFor("2026-10-08")).toBe("thursday");
  });

  it("is null for a day no class is taught on", () => {
    expect(sessionTypeFor("2026-10-06")).toBeNull();
    expect(sessionTypeFor("2026-08-13")).toBeNull();
  });
});

describe("nearestSessionDate", () => {
  it("leaves a session date alone", () => {
    expect(nearestSessionDate("2026-10-08")).toBe("2026-10-08");
  });

  it("falls back to the most recent session, not the next one", () => {
    // Wednesday 7 Oct belongs to Monday's register, still being caught up.
    expect(nearestSessionDate("2026-10-07")).toBe("2026-10-05");
  });

  it("opens on the first session when the year hasn't started", () => {
    expect(nearestSessionDate("2026-08-13")).toBe(YEAR_START);
  });

  it("stays on the last session once the year is over", () => {
    expect(nearestSessionDate("2027-07-01")).toBe("2027-05-27");
  });

  it("falls back to the first session for an unparseable date", () => {
    expect(nearestSessionDate("garbage")).toBe(YEAR_START);
  });
});

describe("nextSessionDate", () => {
  it("leaves a session date alone", () => {
    expect(nextSessionDate("2026-10-05")).toBe("2026-10-05"); // Monday
    expect(nextSessionDate("2026-10-08")).toBe("2026-10-08"); // Thursday
  });

  // The week the register is expected to walk through, day by day. Mon 5 Oct
  // and Thu 8 Oct 2026 are the year's first two sessions.
  it.each([
    ["Tuesday", "2026-10-06", "2026-10-08"],
    ["Wednesday", "2026-10-07", "2026-10-08"],
    ["Friday", "2026-10-09", "2026-10-12"],
    ["Saturday", "2026-10-10", "2026-10-12"],
    ["Sunday", "2026-10-11", "2026-10-12"],
  ])("resolves %s forward to the next lesson", (_day, from, expected) => {
    expect(nextSessionDate(from)).toBe(expected);
  });

  it("is the opposite of nearestSessionDate on a non-lesson day", () => {
    expect(nearestSessionDate("2026-10-07")).toBe("2026-10-05");
    expect(nextSessionDate("2026-10-07")).toBe("2026-10-08");
  });

  it("opens on the first session before the year starts", () => {
    expect(nextSessionDate("2026-08-13")).toBe(YEAR_START);
    expect(nextSessionDate(YEAR_START)).toBe(YEAR_START);
  });

  it("stays on the last session once the year is over", () => {
    expect(nextSessionDate("2027-07-01")).toBe("2027-05-27");
    expect(nextSessionDate("2027-05-28")).toBe("2027-05-27");
  });

  it("falls back to the first session for an unparseable date", () => {
    expect(nextSessionDate("garbage")).toBe(YEAR_START);
  });

  it("never returns a date that isn't taught", () => {
    const dates = sessionDates();
    for (const iso of ["2026-10-06", "2026-12-25", "2027-03-14", "2027-01-01"]) {
      expect(dates).toContain(nextSessionDate(iso));
    }
  });

  it("skips a holiday rather than landing on it", () => {
    const [first] = Object.keys(HOLIDAYS);
    if (!first) return; // no faculty calendar yet — nothing to assert
    expect(nextSessionDate(first)).not.toBe(first);
    expect(nextSessionDate(first) > first).toBe(true);
  });
});

describe("previousSessionDate", () => {
  it("steps back one lesson from a session date", () => {
    expect(previousSessionDate("2026-10-08")).toBe("2026-10-05");
    expect(previousSessionDate("2026-10-12")).toBe("2026-10-08");
  });

  it("is null for the year's first session — nothing sits behind it", () => {
    expect(previousSessionDate(YEAR_START)).toBeNull();
  });

  it("is null for any date before the year opens", () => {
    expect(previousSessionDate("2026-08-13")).toBeNull();
  });

  it("is the last session of the year for a date after it", () => {
    expect(previousSessionDate("2027-07-01")).toBe("2027-05-27");
  });

  it("is strictly before its argument, never equal", () => {
    for (const iso of sessionDates().slice(1, 20)) {
      expect(previousSessionDate(iso)! < iso).toBe(true);
    }
  });
});

describe("holidayReason", () => {
  it("is null for a day that is taught", () => {
    expect(holidayReason("2026-10-05")).toBeNull();
  });

  it("is null for a day outside the year", () => {
    expect(holidayReason("2026-08-13")).toBeNull();
  });
});
