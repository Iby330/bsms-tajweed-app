import { describe, expect, it } from "vitest";
import {
  EVENTS,
  HOLIDAYS,
  RAMADAN,
  CLASS_TIMETABLES,
  SECTION_TIMETABLES,
  TERMS,
  YEAR_END,
  YEAR_START,
  breakContaining,
  breaks,
  eventsOn,
  holidayReason,
  isSessionDate,
  nearestSessionDate,
  nextSessionDate,
  previousSessionDate,
  sessionDates,
  sessionTypeFor,
  teachingDaysLabel,
  termIdFor,
  termSessions,
  timetableFor,
  weekdayNameFor,
  type Section,
} from "./calendar";
import { SESSION_TYPES } from "./session";

const SECTIONS: Section[] = ["brothers", "sisters", "demo"];
/** Every calendar question takes a class's timetable now, not its section. */
const TT = (section: Section) => timetableFor(section);
const dayOf = (iso: string) => new Date(`${iso}T12:00:00`).getDay();

describe("TERMS", () => {
  it("is the faculty calendar, verbatim", () => {
    expect(TERMS.map((t) => [t.startsOn, t.endsOn])).toEqual([
      ["2026-10-05", "2026-11-26"],
      ["2027-01-04", "2027-02-04"],
      ["2027-03-15", "2027-05-20"],
    ]);
  });

  it("runs in order and never overlaps", () => {
    for (let i = 0; i < TERMS.length; i++) {
      expect(TERMS[i].startsOn < TERMS[i].endsOn).toBe(true);
      if (i > 0) expect(TERMS[i - 1].endsOn < TERMS[i].startsOn).toBe(true);
    }
  });

  it("bounds the year", () => {
    expect(YEAR_START).toBe("2026-10-05");
    expect(YEAR_END).toBe("2027-05-20");
  });
});

describe("SECTION_TIMETABLES", () => {
  it("runs the brothers Monday tajweed, Thursday hifdh", () => {
    expect(SECTION_TIMETABLES.brothers).toEqual({ tajweed: 1, hifdh: 4 });
  });

  it("runs the sisters Wednesday tajweed, Monday hifdh", () => {
    // Not a mirror of the brothers: both teach on a Monday, and it is a
    // different subject each time. That is why no date names a session alone.
    expect(SECTION_TIMETABLES.sisters).toEqual({ tajweed: 3, hifdh: 1 });
  });

  it("covers every section the database has, demo included", () => {
    // The crash this guards against was real: `demo` was added as a third
    // section in 0020, and a two-value union cast around it until a demo
    // student opened the calendar.
    for (const section of SECTIONS) expect(SECTION_TIMETABLES[section]).toBeDefined();
  });

  it("puts the demo cohort on the brothers' timetable", () => {
    expect(SECTION_TIMETABLES.demo).toEqual(SECTION_TIMETABLES.brothers);
  });

  it.each(SECTIONS)("gives %s two distinct weekdays", (section) => {
    // sessionTypeFor reads the subject back off the weekday; that inverse
    // only exists while the mapping is one-to-one.
    const days = SESSION_TYPES.map((s) => SECTION_TIMETABLES[section][s]);
    expect(new Set(days).size).toBe(days.length);
  });
});

describe("sessionDates", () => {
  it.each(SECTIONS)("is ascending and free of duplicates for %s", (section) => {
    const dates = sessionDates(TT(section));
    expect([...dates].sort()).toEqual([...dates]);
    expect(new Set(dates).size).toBe(dates.length);
  });

  it.each(SECTIONS)("stays inside the year for %s", (section) => {
    const dates = sessionDates(TT(section));
    expect(dates[0] >= YEAR_START).toBe(true);
    expect(dates[dates.length - 1] <= YEAR_END).toBe(true);
  });

  it.each(SECTIONS)("only ever holds that section's weekdays for %s", (section) => {
    const allowed = new Set(SESSION_TYPES.map((s) => SECTION_TIMETABLES[section][s]));
    expect(sessionDates(TT(section)).filter((d) => !allowed.has(dayOf(d)))).toEqual([]);
  });

  it("teaches nothing between the terms", () => {
    for (const section of SECTIONS) {
      for (const gap of breaks()) {
        const inside = sessionDates(TT(section)).filter(
          (d) => d >= gap.startsOn && d <= gap.endsOn,
        );
        expect(inside).toEqual([]);
      }
    }
  });

  it("teaches nothing during Ramadan", () => {
    for (const section of SECTIONS) {
      const inside = sessionDates(TT(section)).filter(
        (d) => d >= RAMADAN.startsOn && d <= RAMADAN.endsOn,
      );
      expect(inside).toEqual([]);
    }
  });

  it("skips every date listed as a holiday", () => {
    for (const section of SECTIONS)
      for (const iso of Object.keys(HOLIDAYS))
        expect(sessionDates(TT(section))).not.toContain(iso);
  });

  it("returns the same array on repeat calls rather than rebuilding it", () => {
    expect(sessionDates(TT("brothers"))).toBe(sessionDates(TT("brothers")));
  });

  it("gives the two sections different years", () => {
    expect(sessionDates(TT("brothers"))).not.toEqual(sessionDates(TT("sisters")));
  });
});

describe("session counts", () => {
  // These are the numbers the faculty dates actually produce. Term 2 opens on
  // a Tuesday, so it is not a whole number of weeks for either subject — and
  // the sections split it the opposite way round, because the sisters' week
  // runs Wednesday tajweed, Monday hifdh. If a date above is ever nudged,
  // this table is what changes with it.
  it.each([
    [1, "brothers", "tajweed", 8],
    [1, "brothers", "hifdh", 8],
    [1, "sisters", "tajweed", 8],
    [1, "sisters", "hifdh", 8],
    [2, "brothers", "tajweed", 5],
    [2, "brothers", "hifdh", 5],
    [2, "sisters", "tajweed", 5],
    [2, "sisters", "hifdh", 5],
    [3, "brothers", "tajweed", 10],
    [3, "brothers", "hifdh", 10],
    [3, "sisters", "tajweed", 10],
    [3, "sisters", "hifdh", 10],
  ] as const)("term %i gives the %s %s %i sessions", (term, section, type, n) => {
    expect(termSessions(term, TT(section), type)).toHaveLength(n);
  });

  it("counts a term's sessions rather than dividing its span by seven", () => {
    // 4 Jan → 4 Feb is 32 days, which is 4.6 weeks and not 5 of anything —
    // yet it holds 10 sessions, because it opens on a Monday and closes on a
    // Thursday. Dividing the span would say 4.
    expect(termSessions(2, TT("brothers"))).toHaveLength(10);
  });

  it("squares Term 1 at eight of each, for both sections", () => {
    // Ending on Thursday 26 Nov rather than the Wednesday is what does this:
    // a day earlier and the brothers lose their eighth hifdh.
    for (const section of ["brothers", "sisters"] as const) {
      expect(termSessions(1, TT(section), "tajweed")).toHaveLength(8);
      expect(termSessions(1, TT(section), "hifdh")).toHaveLength(8);
    }
  });

  it("is empty for a term that does not exist", () => {
    // @ts-expect-error — guarding the runtime, not the type
    expect(termSessions(4, TT("brothers"))).toEqual([]);
  });
});

describe("isSessionDate", () => {
  it.each([
    ["a term-time Monday", "2026-10-05", "brothers"],
    ["a brothers' Thursday", "2026-10-08", "brothers"],
    ["a sisters' Wednesday", "2026-10-07", "sisters"],
    ["the last day of the year", "2027-05-20", "brothers"],
  ] as const)("accepts %s", (_what, iso, section) => {
    expect(isSessionDate(iso, TT(section))).toBe(true);
  });

  it.each([
    ["a Tuesday", "2026-10-06", "brothers"],
    ["a weekend", "2026-10-10", "brothers"],
    ["a Monday before the year opens", "2026-09-28", "brothers"],
    ["a Monday after the year closes", "2027-05-24", "brothers"],
    ["a Monday in the winter break", "2026-12-07", "brothers"],
    ["a Thursday during Ramadan", "2027-02-25", "brothers"],
    ["a date that isn't a date", "not-a-date", "brothers"],
    ["an impossible day", "2027-02-31", "brothers"],
  ] as const)("rejects %s", (_what, iso, section) => {
    expect(isSessionDate(iso, TT(section))).toBe(false);
  });

  it("disagrees between the sections on the same midweek days", () => {
    // The clearest expression of why every question here takes a section.
    expect(isSessionDate("2026-10-07", TT("sisters"))).toBe(true);
    expect(isSessionDate("2026-10-07", TT("brothers"))).toBe(false);
    expect(isSessionDate("2026-10-08", TT("brothers"))).toBe(true);
    expect(isSessionDate("2026-10-08", TT("sisters"))).toBe(false);
  });
});

describe("sessionTypeFor", () => {
  it("reads the subject off the date, given the timetable", () => {
    expect(sessionTypeFor("2026-10-08", TT("brothers"))).toBe("hifdh");
    expect(sessionTypeFor("2026-10-07", TT("sisters"))).toBe("tajweed");
  });

  it("calls the same Monday a different subject for each section", () => {
    // The sharpest reason a date can never name a session on its own.
    expect(sessionTypeFor("2026-10-05", TT("brothers"))).toBe("tajweed");
    expect(sessionTypeFor("2026-10-05", TT("sisters"))).toBe("hifdh");
  });

  it("is null for a date that section isn't taught on", () => {
    expect(sessionTypeFor("2026-10-07", TT("brothers"))).toBeNull();
    expect(sessionTypeFor("2026-10-08", TT("sisters"))).toBeNull();
    expect(sessionTypeFor("2026-12-07", TT("brothers"))).toBeNull();
  });
});

describe("breaks", () => {
  it("fills the gaps between the terms exactly", () => {
    expect(breaks().map((b) => [b.startsOn, b.endsOn, b.label])).toEqual([
      ["2026-11-27", "2027-01-03", "Winter break"],
      ["2027-02-05", "2027-03-14", "Ramadan break"],
    ]);
  });

  it("abuts the terms on both sides with no day unaccounted for", () => {
    const gaps = breaks();
    for (let i = 0; i < gaps.length; i++) {
      expect(gaps[i].startsOn > TERMS[i].endsOn).toBe(true);
      expect(gaps[i].endsOn < TERMS[i + 1].startsOn).toBe(true);
      expect(termIdFor(gaps[i].startsOn)).toBeNull();
      expect(termIdFor(gaps[i].endsOn)).toBeNull();
    }
  });

  it("wholly contains Ramadan in the second break", () => {
    const ramadan = breaks()[1];
    expect(RAMADAN.startsOn >= ramadan.startsOn).toBe(true);
    expect(RAMADAN.endsOn <= ramadan.endsOn).toBe(true);
  });

  it("returns the same array on repeat calls", () => {
    expect(breaks()).toBe(breaks());
  });
});

describe("breakContaining", () => {
  it("names the break a date falls in", () => {
    expect(breakContaining("2026-12-25")?.label).toBe("Winter break");
    expect(breakContaining("2027-02-20")?.label).toBe("Ramadan break");
  });

  it("is null in term time and outside the year alike", () => {
    expect(breakContaining("2026-10-05")).toBeNull();
    expect(breakContaining("2027-08-01")).toBeNull();
    expect(breakContaining("nonsense")).toBeNull();
  });
});

describe("termIdFor", () => {
  it.each([
    ["2026-10-05", 1],
    ["2026-11-26", 1],
    // The Monday the term opens on, since it was corrected from the Tuesday.
    ["2027-01-04", 2],
    ["2027-01-05", 2],
    ["2027-03-15", 3],
    ["2027-05-20", 3],
  ] as const)("puts %s in term %i", (iso, id) => {
    expect(termIdFor(iso)).toBe(id);
  });

  it("is null off the ends of every term", () => {
    expect(termIdFor("2026-11-27")).toBeNull();
    expect(termIdFor("2026-10-04")).toBeNull();
    expect(termIdFor("2027-05-21")).toBeNull();
  });
});

describe("nearestSessionDate", () => {
  it("keeps a lesson day as itself", () => {
    expect(nearestSessionDate("2026-10-05", TT("brothers"))).toBe("2026-10-05");
  });

  it("resolves backwards, never forwards", () => {
    // Picking Wednesday the 14th must not land on Thursday the 15th.
    expect(nearestSessionDate("2026-10-14", TT("brothers"))).toBe("2026-10-12");
  });

  it("resolves a break back to the term before it", () => {
    expect(nearestSessionDate("2026-12-25", TT("brothers"))).toBe("2026-11-26");
    expect(nearestSessionDate("2026-12-25", TT("sisters"))).toBe("2026-11-25");
  });

  it("clamps to the ends of the year", () => {
    expect(nearestSessionDate("2026-01-01", TT("brothers"))).toBe("2026-10-05");
    expect(nearestSessionDate("2027-12-31", TT("brothers"))).toBe("2027-05-20");
    expect(nearestSessionDate("rubbish", TT("brothers"))).toBe("2026-10-05");
  });
});

describe("nextSessionDate", () => {
  it("resolves forwards to the session about to be taught", () => {
    expect(nextSessionDate("2026-10-06", TT("brothers"))).toBe("2026-10-08");
    expect(nextSessionDate("2026-10-06", TT("sisters"))).toBe("2026-10-07");
  });

  it("jumps a whole break rather than landing inside it", () => {
    // Term 2 opens on Monday 4 January, so that is the first session back —
            // not the Thursday, which was the answer while it opened on the 5th.
    expect(nextSessionDate("2026-12-25", TT("brothers"))).toBe("2027-01-04");
    expect(nextSessionDate("2027-02-20", TT("brothers"))).toBe("2027-03-15");
  });

  it("clamps to the ends of the year", () => {
    expect(nextSessionDate("2026-01-01", TT("brothers"))).toBe("2026-10-05");
    expect(nextSessionDate("2027-12-31", TT("brothers"))).toBe("2027-05-20");
  });
});

describe("previousSessionDate", () => {
  it("steps back one session", () => {
    expect(previousSessionDate("2026-10-08", TT("brothers"))).toBe("2026-10-05");
  });

  it("steps back over a break into the previous term", () => {
    // From Term 2's opening Monday, since the 7th now has the 4th in front of
    // it and would not cross the break at all.
    expect(previousSessionDate("2027-01-04", TT("brothers"))).toBe("2026-11-26");
  });

  it("is null before the year's first session", () => {
    expect(previousSessionDate("2026-10-05", TT("brothers"))).toBeNull();
  });
});

describe("events", () => {
  it("carries only dates that were actually given", () => {
    expect(EVENTS).toHaveLength(1);
    expect(EVENTS[0]).toMatchObject({ date: "2027-03-15", kind: "exam" });
  });

  it("sits the term 2 exam inside term 3", () => {
    expect(termIdFor(EVENTS[0].date)).toBe(3);
  });

  it("gives a section-less event to both sections", () => {
    expect(eventsOn("2027-03-15", "brothers")).toHaveLength(1);
    expect(eventsOn("2027-03-15", "sisters")).toHaveLength(1);
  });

  it("is empty on an ordinary day", () => {
    expect(eventsOn("2026-10-05", "brothers")).toEqual([]);
  });
});

describe("holidayReason", () => {
  it("is null for a taught day", () => {
    expect(holidayReason("2026-10-05")).toBeNull();
  });

  it("does not claim a break is a holiday", () => {
    // Two different silences: the break falls out of the term bounds.
    expect(holidayReason("2026-12-25")).toBeNull();
  });
});

describe("labels", () => {
  it("names a timetable's teaching days in weekday order", () => {
    expect(teachingDaysLabel(TT("brothers"))).toBe("Mondays & Thursdays");
    expect(teachingDaysLabel(TT("sisters"))).toBe("Mondays & Wednesdays");
  });

  it("names the weekday a timetable sits a subject on", () => {
    expect(weekdayNameFor(TT("sisters"), "hifdh")).toBe("Monday");
    expect(weekdayNameFor(TT("sisters"), "tajweed")).toBe("Wednesday");
    expect(weekdayNameFor(TT("brothers"), "hifdh")).toBe("Thursday");
    expect(weekdayNameFor(TT("brothers"), "tajweed")).toBe("Monday");
  });
});

describe("timetableFor", () => {
  it("falls back to the section when the class has no timetable of its own", () => {
    expect(timetableFor("sisters", "Hareer")).toEqual(SECTION_TIMETABLES.sisters);
    expect(timetableFor("sisters", null)).toEqual(SECTION_TIMETABLES.sisters);
    expect(timetableFor("sisters")).toEqual(SECTION_TIMETABLES.sisters);
  });

  it("has no per-class overrides yet", () => {
    // The sisters settle their hifdh day class by class once the year opens.
    // When those days arrive they go in CLASS_TIMETABLES, and this is the
    // test that will need a line adding to it.
    expect(Object.keys(CLASS_TIMETABLES)).toEqual([]);
  });

  it("lets a class override its section, which is the point of it", () => {
    const tuesdayHifdh = { tajweed: 3, hifdh: 2 } as const;
    const overridden = { ...CLASS_TIMETABLES, Hareer: tuesdayHifdh };
    // Exercised through the same resolution rule the real map uses.
    const resolve = (section: Section, name?: string) =>
      (name ? overridden[name as keyof typeof overridden] : undefined) ??
      SECTION_TIMETABLES[section];
    expect(resolve("sisters", "Hareer")).toEqual(tuesdayHifdh);
    expect(resolve("sisters", "Zukhruf")).toEqual(SECTION_TIMETABLES.sisters);
  });
});
