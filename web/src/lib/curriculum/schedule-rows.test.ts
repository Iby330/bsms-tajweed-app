import { describe, it, expect } from "vitest";
import { scheduleFromRows, type ScheduleInput } from "./schedule-rows";
import { scheduledUnlockAt, type WeekRow } from "./tree";

const weeks: WeekRow[] = [
  { id: "w11", term_id: 1, number: 1, unlock_at: "2026-10-01T12:00:00Z", due_at: "2026-10-04T17:00:00Z" },
  { id: "w12", term_id: 1, number: 2, unlock_at: "2026-10-08T12:00:00Z", due_at: "2026-10-11T17:00:00Z" },
  { id: "w21", term_id: 2, number: 1, unlock_at: "2027-01-07T13:00:00Z", due_at: "2027-01-10T18:00:00Z" },
  { id: "w32", term_id: 3, number: 2, unlock_at: "2027-04-22T12:00:00Z", due_at: "2027-04-25T17:00:00Z" },
];
const input = (over: Partial<ScheduleInput>): ScheduleInput => ({
  rows: [
    { course_id: "GH", term_id: 1, position: 1, due_days_after_unlock: null, courses: { key: "ghunna", label: "Ghunna" } },
    { course_id: "SF", term_id: 2, position: 2, due_days_after_unlock: null, courses: { key: "sifaat", label: "Ṣifāt" } },
  ],
  items: [], section: null, rule: null, weeks, sectionWeeks: [], dates: [], holds: [], added: [],
  ...over,
});

describe("scheduleFromRows, an item's own term", () => {
  it("puts a taken course's item met in another term in itemTerms", () => {
    const s = scheduleFromRows(input({
      items: [
        { course_id: "SF", ordinal: 3, week_number: 8, term_id: 1 },
        { course_id: "SF", ordinal: 2, week_number: 5, term_id: null },
        // its course's own term, written out: no override
        { course_id: "GH", ordinal: 4, week_number: 6, term_id: 1 },
        // a course the class does not take: class_item_week never reads it
        { course_id: "XX", ordinal: 1, week_number: 2, term_id: 3 },
      ],
    }))!;
    expect(s.itemTerms).toEqual({ SF: { 3: 1 } });
    expect(s.itemWeeks?.SF).toEqual({ 3: 8, 2: 5 });
    expect(s.itemWeeks?.GH).toEqual({ 4: 6 });
  });

  it("has no item terms when every row is in its course's term", () => {
    const s = scheduleFromRows(input({ items: [{ course_id: "GH", ordinal: 1, week_number: 2, term_id: null }] }))!;
    expect(s.itemTerms).toEqual({});
  });

  it("files an added course under its earliest term, and each later row in itemTerms", () => {
    const s = scheduleFromRows(input({
      added: [
        { course_id: "MD", ordinal: 4, term_id: 3, week_number: 2, courses: { key: "mudood", label: "Mudūd" } },
        { course_id: "MD", ordinal: 2, term_id: 1, week_number: 1, courses: { key: "mudood", label: "Mudūd" } },
      ],
    }))!;
    const md = s.courses.find((c) => c.courseId === "MD")!;
    expect(md).toMatchObject({ termId: 1, added: true, ordinals: [2, 4] });
    expect(s.itemTerms).toEqual({ MD: { 4: 3 } });
    expect(s.itemWeeks?.MD).toEqual({ 2: 1, 4: 2 });
    // and each opens with its own row's term, as class_item_week has it
    expect(scheduledUnlockAt(s, md.termId, 2, "MD")).toBe("2026-10-01T12:00:00.000Z");
    expect(scheduledUnlockAt(s, md.termId, 4, "MD")).toBe("2027-04-22T12:00:00.000Z");
  });
});
