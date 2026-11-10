import { describe, expect, it } from "vitest";
import {
  classSummary, dayKey, initials, needsAttention, relativeDay, rosterStats, sortRoster, studentStats,
} from "./roster-data";
import { MIN, timed } from "../session-fixtures";
import { DEFAULT_CLASS_TARGET, type ClassTarget } from "@/lib/murajaah/targets";
import type { SessionView } from "@/lib/murajaah/sessions";

// Sunday 8 Nov 2026, 12:00 in London (GMT).
const NOW = Date.parse("2026-11-08T12:00:00.000Z");
const ALI = { id: "r1", name: "Abdallah Ghouse" };
const YUNUS = { id: "r2", name: "Yunus Zafar" };

const juz = (ms: number, at: string, mistakes = 1, over: Partial<SessionView> = {}) =>
  timed(ms, { at, mistakes, reciterId: ALI.id, ...over });

describe("dayKey and relativeDay", () => {
  it("keys days in London, so a late-evening BST save is that day", () => {
    expect(dayKey("2026-07-01T23:30:00.000Z")).toBe("2026-07-02");
    expect(dayKey("2026-11-01T23:30:00.000Z")).toBe("2026-11-01");
  });
  it("reads today, yesterday, and N days ago", () => {
    expect(relativeDay("2026-11-08T09:00:00.000Z", NOW)).toBe("today");
    expect(relativeDay("2026-11-07T21:00:00.000Z", NOW)).toBe("yesterday");
    expect(relativeDay("2026-11-04T18:00:00.000Z", NOW)).toBe("4 days ago");
  });
});

describe("initials", () => {
  it("takes the first letters of two names, or two letters of one", () => {
    expect(initials("Abdallah Ghouse")).toBe("AG");
    expect(initials("Shamoon")).toBe("SH");
  });
});

describe("studentStats", () => {
  it("is empty and flagged when there are no attempts", () => {
    const st = studentStats(ALI, [], DEFAULT_CLASS_TARGET, null, NOW);
    expect(st.last).toBeNull();
    expect(st.weekTotal).toBe(0);
    expect(st.trend).toBe("few");
    expect(st.reasons).toEqual(["No attempts yet"]);
  });

  it("judges the latest attempt by the CURRENT target and override", () => {
    const list = [juz(16 * MIN, "2026-11-04", 6)];
    const st = studentStats(ALI, list, DEFAULT_CLASS_TARGET, null, NOW);
    expect(st.lastBand).toBe("ideal");
    expect(st.lastLimit).toBe(5);
    expect(st.lastOver).toBe(true);
    const eased = studentStats(ALI, list, DEFAULT_CLASS_TARGET, { hizb: null, juz: 8, surah10: null }, NOW);
    expect(eased.lastLimit).toBe(8);
    expect(eased.lastOver).toBe(false);
    expect(eased.hasOverride).toBe(true);
    const strict: ClassTarget = { ...DEFAULT_CLASS_TARGET, minutes: { ideal: 4, good: 5, acceptable: 6 } };
    expect(studentStats(ALI, list, strict, null, NOW).lastBand).toBe("slow");
  });

  it("only counts this student's saved attempts, oldest first", () => {
    const mine = juz(16 * MIN, "2026-11-04");
    const theirs = timed(10 * MIN, { at: "2026-11-05", reciterId: YUNUS.id });
    const draft = { ...juz(9 * MIN, "2026-11-06"), submittedAt: null };
    const older = juz(20 * MIN, "2026-11-01");
    const st = studentStats(ALI, [mine, theirs, draft, older], DEFAULT_CLASS_TARGET, null, NOW);
    expect(st.attempts.map((a) => a.id)).toEqual([older.id, mine.id]);
    expect(st.last?.id).toBe(mine.id);
  });

  it("counts the last 7 London days, oldest first, today last", () => {
    const list = [
      juz(16 * MIN, "2026-11-01T10:00:00.000Z"), // 8 Nov − 7: outside
      juz(16 * MIN, "2026-11-02T10:00:00.000Z"),
      juz(16 * MIN, "2026-11-07T10:00:00.000Z"),
      juz(16 * MIN, "2026-11-07T20:00:00.000Z"),
      juz(16 * MIN, "2026-11-08T08:00:00.000Z"),
    ];
    const st = studentStats(ALI, list, DEFAULT_CLASS_TARGET, null, NOW);
    expect(st.week).toEqual([1, 0, 0, 0, 0, 2, 1]);
    expect(st.weekDays[0]).toBe("2026-11-02");
    expect(st.weekDays[6]).toBe("2026-11-08");
    expect(st.weekTotal).toBe(4);
    expect(st.reasons).toEqual([]);
  });

  it("finds the best time per hizb across portions", () => {
    const hizb = juz(9 * MIN, "2026-11-05", 0, { kind: "hizb", ns: [58], label: "Hizb 58", hizbEq: 1 });
    const list = [juz(16 * MIN + 20_000, "2026-11-04"), hizb];
    const st = studentStats(ALI, list, DEFAULT_CLASS_TARGET, null, NOW);
    expect(st.best).toEqual({ ms: 8 * MIN + 10_000, label: "Juz 30", date: list[0].submittedAt });
    expect(st.perHizbMs).toEqual([8 * MIN + 10_000, 9 * MIN]);
  });

  it("calls the trend on time per hizb: the last three against the three before", () => {
    const at = (d: number) => `2026-10-${String(d).padStart(2, "0")}`;
    const faster = [22, 22, 22, 18, 18, 18].map((m, i) => juz(m * MIN, at(i + 1)));
    expect(studentStats(ALI, faster, DEFAULT_CLASS_TARGET, null, NOW).trend).toBe("faster");
    const slower = [18, 18, 18, 22, 22, 22].map((m, i) => juz(m * MIN, at(i + 1)));
    expect(studentStats(ALI, slower, DEFAULT_CLASS_TARGET, null, NOW).trend).toBe("slower");
    const steady = [20, 20, 20, 20.4, 20.4, 20.4].map((m, i) => juz(m * MIN, at(i + 1)));
    expect(studentStats(ALI, steady, DEFAULT_CLASS_TARGET, null, NOW).trend).toBe("steady");
    // Four attempts compare the last two with the two before; three is too few.
    const four = [22, 22, 18, 18].map((m, i) => juz(m * MIN, at(i + 1)));
    expect(studentStats(ALI, four, DEFAULT_CLASS_TARGET, null, NOW).trend).toBe("faster");
    expect(studentStats(ALI, four.slice(0, 3), DEFAULT_CLASS_TARGET, null, NOW).trend).toBe("few");
  });

  it("flags nothing in 7 days, the limit missed twice running, and Too slow twice running", () => {
    const stale = [juz(16 * MIN, "2026-10-20")];
    expect(studentStats(ALI, stale, DEFAULT_CLASS_TARGET, null, NOW).reasons).toEqual(["Nothing logged in 7 days"]);

    const overOnce = [juz(16 * MIN, "2026-11-05", 6), juz(16 * MIN, "2026-11-06", 2)];
    expect(studentStats(ALI, overOnce, DEFAULT_CLASS_TARGET, null, NOW).reasons).toEqual([]);
    const overTwice = [juz(16 * MIN, "2026-11-05", 6), juz(16 * MIN, "2026-11-06", 7)];
    expect(studentStats(ALI, overTwice, DEFAULT_CLASS_TARGET, null, NOW).reasons).toEqual([
      "Over the mistake limit twice running",
    ]);
    // An override lifts the limit, and the flag with it (the limit is inclusive).
    expect(studentStats(ALI, overTwice, DEFAULT_CLASS_TARGET, { hizb: null, juz: 7, surah10: null }, NOW).reasons).toEqual([]);

    const slowTwice = [juz(41 * MIN, "2026-11-05"), juz(45 * MIN, "2026-11-06")];
    expect(studentStats(ALI, slowTwice, DEFAULT_CLASS_TARGET, null, NOW).reasons).toEqual(["Too slow twice running"]);
  });
});

describe("rosterStats, summary, attention and sorting", () => {
  const list = [
    juz(16 * MIN, "2026-11-04"),
    juz(18 * MIN, "2026-11-06"),
    timed(30 * MIN, { at: "2026-10-01", reciterId: YUNUS.id }),
  ];
  const rows = rosterStats([YUNUS, ALI], list, DEFAULT_CLASS_TARGET, [
    { studentId: YUNUS.id, hizb: 4, juz: null, surah10: null, note: "Easing in" },
  ], NOW);

  it("gives one row per student with their own override", () => {
    expect(rows.map((r) => r.student.name)).toEqual(["Yunus Zafar", "Abdallah Ghouse"]);
    expect(rows[0].hasOverride).toBe(true);
    expect(rows[1].hasOverride).toBe(false);
  });

  it("summarises the week across the class", () => {
    expect(classSummary(rows)).toEqual({ students: 2, weekTotal: 2, activeWeek: 1, faster: 0 });
  });

  it("lists who needs attention, by name", () => {
    expect(needsAttention(rows).map((r) => [r.student.name, r.reasons])).toEqual([
      ["Yunus Zafar", ["Nothing logged in 7 days"]],
    ]);
  });

  it("sorts by name, then by a column either way", () => {
    expect(sortRoster(rows, "name", 1).map((r) => r.student.id)).toEqual([ALI.id, YUNUS.id]);
    expect(sortRoster(rows, "week", -1).map((r) => r.student.id)).toEqual([ALI.id, YUNUS.id]);
    expect(sortRoster(rows, "best", 1).map((r) => r.student.id)).toEqual([ALI.id, YUNUS.id]);
    expect(sortRoster(rows, "last", -1).map((r) => r.student.id)).toEqual([ALI.id, YUNUS.id]);
  });
});
