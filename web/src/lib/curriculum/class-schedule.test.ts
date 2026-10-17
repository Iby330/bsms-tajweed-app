import { describe, it, expect } from "vitest";
import {
  buildTree, dateSource, defaultDueAt, defaultUnlockAt, itemHeld, nextWeekdayAt,
  scheduledDueAt, scheduledUnlockAt, type ClassSchedule, type CurriculumRows,
} from "./tree";

/* The brothers' Term 1 weeks as the database has them (UTC instants). */
const weeksByTerm = {
  1: [
    { number: 2, unlock_at: "2026-10-08T12:00:00Z", due_at: "2026-10-12T13:00:00Z" }, // Thu 13:00 → Mon 14:00 BST
    { number: 3, unlock_at: "2026-10-15T12:00:00Z", due_at: "2026-10-19T13:00:00Z" },
    { number: 4, unlock_at: "2026-10-22T12:00:00Z", due_at: "2026-10-26T14:00:00Z" }, // due on GMT
    { number: 5, unlock_at: "2026-10-29T13:00:00Z", due_at: "2026-11-02T14:00:00Z" },
  ],
};
const course = (courseId: string, extra: object = {}) =>
  ({ courseId, key: courseId, label: courseId, termId: 1, position: 1, ...extra });
const base = (over: Partial<ClassSchedule> = {}): ClassSchedule => ({
  courses: [course("GH"), course("UK", { dueDaysAfterUnlock: 7 })],
  firstUnlockByTerm: { 1: "2026-10-08T12:00:00Z" },
  weeksByTerm,
  ...over,
});

describe("nextWeekdayAt", () => {
  it("is the first such weekday and time strictly after", () => {
    // after Thu 15 Oct 13:00 BST, the next Thursday 20:15 is the same evening
    expect(nextWeekdayAt("2026-10-15T12:00:00Z", 4, "20:15")).toBe("2026-10-15T19:15:00.000Z");
    // exactly at the time is not after it
    expect(nextWeekdayAt("2026-10-15T19:15:00Z", 4, "20:15")).toBe("2026-10-22T19:15:00.000Z");
  });
  it("keeps the UK wall clock across the October change", () => {
    // Thu 22 Oct 13:00 BST + a week → Thu 29 Oct 13:00 GMT
    expect(nextWeekdayAt("2026-10-22T11:00:00Z", 4, "13:00", 1)).toBe("2026-10-29T13:00:00.000Z");
  });
});

describe("a class with nothing set", () => {
  it("is exactly the week calendar, as before", () => {
    const s = base();
    expect(scheduledUnlockAt(s, 1, 3, "GH")).toBe("2026-10-15T12:00:00.000Z");
    expect(scheduledDueAt(s, 1, 3, "GH")).toBe("2026-10-19T13:00:00.000Z");
    expect(scheduledDueAt(s, 1, 3, "UK")).toBe("2026-10-22T12:00:00.000Z"); // 7 days after
    expect(itemHeld(s, 3, "GH")).toBe(false);
    expect(dateSource(s, 3, "GH", "opens")).toBe("calendar");
  });
});

describe("an item's own dates", () => {
  const s = base({ itemDates: { GH: { 3: { opensAt: "2026-10-14T08:00:00Z", dueAt: null, held: null } } } });
  it("opens on its own date", () => {
    expect(scheduledUnlockAt(s, 1, 3, "GH")).toBe("2026-10-14T08:00:00.000Z");
    expect(dateSource(s, 3, "GH", "opens")).toBe("own");
  });
  it("keeps its week's deadline when only the opening is its own", () => {
    expect(scheduledDueAt(s, 1, 3, "GH")).toBe("2026-10-19T13:00:00.000Z");
  });
  it("an own deadline wins over the class default and days-after", () => {
    const t = base({
      rule: { open: null, due: { weekday: 4, time: "20:15", weeksAfter: 0 } },
      itemDates: { UK: { 3: { opensAt: null, dueAt: "2026-10-30T19:00:00Z", held: null } } },
    });
    expect(scheduledDueAt(t, 1, 3, "UK")).toBe("2026-10-30T19:00:00.000Z");
  });
});

describe("the class default", () => {
  const s = base({ rule: { open: { weekday: 5, time: "18:00" }, due: { weekday: 4, time: "20:15", weeksAfter: 1 } } });
  it("opens on its weekday in the week before the calendar's deadline", () => {
    // week 3 is due Mon 19 Oct; the Friday 18:00 after Mon 12 Oct 14:00 is Fri 16 Oct
    expect(scheduledUnlockAt(s, 1, 3, "GH")).toBe("2026-10-16T17:00:00.000Z");
    expect(dateSource(s, 3, "GH", "opens")).toBe("class");
  });
  it("is due on its weekday after it opens, so many weeks later", () => {
    // first Thursday 20:15 after Fri 16 Oct is Thu 22 Oct; a week after that, Thu 29 Oct (GMT)
    expect(scheduledDueAt(s, 1, 3, "GH")).toBe("2026-10-29T20:15:00.000Z");
  });
  it("comes before days-after-opening", () => {
    expect(scheduledDueAt(s, 1, 3, "UK")).toBe("2026-10-29T20:15:00.000Z");
  });
  it("gives the default dates an item would go back to", () => {
    const t = { ...s, itemDates: { GH: { 3: { opensAt: "2026-10-14T08:00:00Z", dueAt: "2026-10-20T10:00:00Z", held: null } } } };
    const opens = defaultUnlockAt(t, 1, 3, "GH");
    expect(opens).toBe("2026-10-16T17:00:00.000Z");
    expect(defaultDueAt(t, 1, 3, "GH", opens)).toBe("2026-10-29T20:15:00.000Z");
  });
});

describe("held", () => {
  it("an own hold, an own release over a course hold, and the course hold", () => {
    const s = base({
      courseHolds: { GH: 2 },
      itemDates: { GH: { 4: { opensAt: null, dueAt: null, held: false } }, UK: { 1: { opensAt: null, dueAt: null, held: true } } },
    });
    expect(itemHeld(s, 1, "GH")).toBe(false);
    expect(itemHeld(s, 3, "GH")).toBe(true); // course hold from 2
    expect(itemHeld(s, 4, "GH")).toBe(false); // released by hand
    expect(itemHeld(s, 1, "UK")).toBe(true);
  });
});

describe("buildTree with a class schedule", () => {
  const rows: CurriculumRows = {
    terms: [{ id: 1, starts_on: "2026-10-05", ends_on: "2026-11-26", exam_max: 0 }],
    weeks: [2, 3, 4].map((n) => ({ id: `w${n}`, term_id: 1, number: n, unlock_at: weeksByTerm[1][n - 2].unlock_at })),
    lessons: [
      { id: "l3", week_id: "w3", course_id: "GH", ordinal: 3, series: "tajweed", title: "Tajweed 3: Idhaar", youtube_id: "x", position: 1 },
      { id: "m2", week_id: "w2", course_id: "MD", ordinal: 2, series: "tajweed", title: "Tajweed 17: Madd", youtube_id: "y", position: 1 },
      { id: "m3", week_id: "w3", course_id: "MD", ordinal: 3, series: "tajweed", title: "Tajweed 18: Madd", youtube_id: "z", position: 1 },
    ],
    homeworks: [],
  } as unknown as CurriculumRows;
  it("locks a held item whatever its date says", () => {
    const s = base({ itemDates: { GH: { 3: { opensAt: null, dueAt: null, held: true } } } });
    const gh = buildTree(rows, new Date("2026-10-16T09:00:00Z"), s)[0].courses.find((c) => c.series === "GH")!;
    expect(gh.modules[0].unlocked).toBe(false);
    expect(gh.modules[0].held).toBe(true);
  });
  it("an added course brings only the items the teacher added, in their week", () => {
    const s = base({
      courses: [course("GH"), course("MD", { added: true, ordinals: [2] })],
      itemWeeks: { MD: { 2: 4 } },
    });
    const md = buildTree(rows, new Date("2026-10-16T09:00:00Z"), s)[0].courses.find((c) => c.series === "MD")!;
    expect(md.modules.map((m) => m.lessons[0].id)).toEqual(["m2"]);
    expect(md.modules[0].weekNumber).toBe(4);
    expect(md.modules[0].unlockAt).toBe("2026-10-22T12:00:00.000Z");
  });
});
