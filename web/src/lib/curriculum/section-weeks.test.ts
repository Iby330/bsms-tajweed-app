import { describe, it, expect } from "vitest";
import { rowsForSection, scheduleWeeks, weeksForSection, withSectionDeadlines, type SectionWeekRow } from "./section-weeks";
import { scheduledDueAt, scheduledUnlockAt, type ClassSchedule, type HomeworkRow } from "./tree";
import { currentWeek } from "@/lib/dashboard/queries";

// Brothers' shared weeks: Thursday 13:00 open, Sunday 18:00 due.
const weeks = [
  { id: "w1", term_id: 1, number: 1, unlock_at: "2026-10-08T12:00:00Z", due_at: "2026-10-11T17:00:00Z" },
  { id: "w2", term_id: 1, number: 2, unlock_at: "2026-10-15T12:00:00Z", due_at: "2026-10-18T17:00:00Z" },
];
// Sisters: Wednesday 19:00 to the next Wednesday 19:00.
const sectionWeeks: SectionWeekRow[] = [
  { section: "sisters", week_id: "w1", unlock_at: "2026-10-07T18:00:00Z", due_at: "2026-10-14T18:00:00Z" },
  { section: "sisters", week_id: "w2", unlock_at: "2026-10-14T18:00:00Z", due_at: "2026-10-21T18:00:00Z" },
];

describe("weeksForSection", () => {
  it("substitutes the section's unlock and due where it has a row", () => {
    const out = weeksForSection(weeks, sectionWeeks, "sisters");
    expect(out.map((w) => [w.unlock_at, w.due_at])).toEqual([
      ["2026-10-07T18:00:00Z", "2026-10-14T18:00:00Z"],
      ["2026-10-14T18:00:00Z", "2026-10-21T18:00:00Z"],
    ]);
    // the rest of the row, and the order, are kept
    expect(out.map((w) => [w.id, w.term_id, w.number])).toEqual([["w1", 1, 1], ["w2", 1, 2]]);
  });

  it("leaves a section with no rows on the shared weeks", () => {
    expect(weeksForSection(weeks, sectionWeeks, "brothers")).toBe(weeks);
    expect(weeksForSection(weeks, sectionWeeks, null)).toBe(weeks);
  });

  it("keeps the week's own times for a week the section has no row for", () => {
    const out = weeksForSection(weeks, sectionWeeks.slice(0, 1), "sisters");
    expect(out[1]).toBe(weeks[1]);
  });

  it("does not mutate the shared rows", () => {
    weeksForSection(weeks, sectionWeeks, "sisters");
    expect(weeks[0].unlock_at).toBe("2026-10-08T12:00:00Z");
  });

  it("flips a sister's current week on Wednesday 19:00, not Thursday", () => {
    const wed1930 = new Date("2026-10-14T18:30:00Z");
    expect(currentWeek(weeksForSection(weeks, sectionWeeks, "sisters"), wed1930)?.id).toBe("w2");
    expect(currentWeek(weeks, wed1930)?.id).toBe("w1");
  });
});

describe("withSectionDeadlines", () => {
  const hws = [
    { id: "h1", week_id: "w1", due_at: "2026-10-11T17:00:00Z" },
    { id: "h2", week_id: "w9", due_at: null },
  ];

  it("gives a homework its section's week due, like homework_due_for", () => {
    const out = withSectionDeadlines(hws, sectionWeeks, "sisters");
    expect(out[0].due_at).toBe("2026-10-14T18:00:00Z");
  });

  it("falls back to the homework's own due, not the week's", () => {
    const out = withSectionDeadlines(hws, sectionWeeks, "sisters");
    expect(out[1]).toBe(hws[1]);
  });

  it("leaves a section with no rows alone", () => {
    expect(withSectionDeadlines(hws, sectionWeeks, "brothers")).toBe(hws);
  });
});

describe("rowsForSection", () => {
  const hw = (id: string, weekId: string, courseId: string | null, ordinal: number): HomeworkRow => ({
    id, week_id: weekId, course_id: courseId, ordinal, number: ordinal, series: "tajweed",
    title: `HW ${ordinal}`, total_marks: 10, due_at: "2026-10-11T17:00:00Z", is_graded: true,
  });
  const rows = {
    terms: [{ id: 1, starts_on: "2026-10-05", ends_on: "2026-12-20", exam_max: 50 }],
    weeks,
    lessons: [],
    homeworks: [hw("h1", "w1", "c1", 1), hw("h2", "w2", "c2", 1)],
  };

  it("puts a no-syllabus reader on the section's weeks and deadlines", () => {
    const out = rowsForSection(rows, sectionWeeks, "sisters", null);
    expect(out.weeks[0].unlock_at).toBe("2026-10-07T18:00:00Z");
    expect(out.homeworks.map((h) => h.due_at)).toEqual(["2026-10-14T18:00:00Z", "2026-10-21T18:00:00Z"]);
    expect(out.terms).toBe(rows.terms);
  });

  it("lets the class's syllabus week win, the section's week covering the rest", () => {
    // c1 is taken, item 1 met in week 2 of the class's (sisters') term; c2 is not taken
    const schedule: ClassSchedule = {
      courses: [{ courseId: "c1", key: "ghunna", label: "Ghunna", termId: 1, position: 1 }],
      firstUnlockByTerm: { 1: "2026-10-07T18:00:00Z" },
      weeksByTerm: { 1: [
        { number: 1, unlock_at: "2026-10-07T18:00:00Z", due_at: "2026-10-14T18:00:00Z" },
        { number: 2, unlock_at: "2026-10-14T18:00:00Z", due_at: "2026-10-21T18:00:00Z" },
      ] },
      itemWeeks: { c1: { 1: 2 } },
    };
    const out = rowsForSection(rows, sectionWeeks, "sisters", schedule);
    expect(out.homeworks[0].due_at).toBe("2026-10-21T18:00:00.000Z");
    expect(out.homeworks[1].due_at).toBe("2026-10-21T18:00:00Z");
  });

  it("changes nothing for a section with no rows", () => {
    const out = rowsForSection(rows, sectionWeeks, "brothers", null);
    expect(out.weeks).toBe(weeks);
    expect(out.homeworks).toBe(rows.homeworks);
  });
});

describe("scheduleWeeks", () => {
  it("builds a sisters' class schedule on their Wednesday", () => {
    const schedule: ClassSchedule = {
      courses: [{ courseId: "c1", key: "ghunna", label: "Ghunna", termId: 1, position: 1 }],
      ...scheduleWeeks([...weeksForSection(weeks, sectionWeeks, "sisters")].reverse()),
      itemWeeks: {},
    };
    expect(schedule.firstUnlockByTerm[1]).toBe("2026-10-07T18:00:00Z");
    expect(schedule.weeksByTerm![1].map((w) => w.number)).toEqual([1, 2]);
    expect(scheduledUnlockAt(schedule, 1, 2, "c1")).toBe("2026-10-14T18:00:00.000Z");
    expect(scheduledDueAt(schedule, 1, 2, "c1")).toBe("2026-10-21T18:00:00.000Z");
    // past the term's last week: a week at a time from the section's last
    expect(scheduledUnlockAt(schedule, 1, 3, "c1")).toBe("2026-10-21T18:00:00.000Z");
  });

  it("keeps a brothers' class on the shared weeks", () => {
    const { weeksByTerm } = scheduleWeeks(weeksForSection(weeks, sectionWeeks, "brothers"));
    expect(weeksByTerm[1][0]).toEqual({ number: 1, unlock_at: weeks[0].unlock_at, due_at: weeks[0].due_at });
  });
});
