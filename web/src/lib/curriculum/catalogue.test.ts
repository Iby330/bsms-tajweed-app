import { describe, it, expect } from "vitest";
import { splitCourses, type CourseBlock } from "./catalogue";

/**
 * The index splits the programme in two: what a student can open, and what is
 * there to show them how much more of it exists. `unlock_all` — the demo flag
 * from migration 0023 — moves the whole of the second half into the first,
 * because the database has already handed that reader every row and a locked
 * tile would be the app lying about what it will let them do.
 */
const block = (series: string, termId: number | null, over: Partial<CourseBlock> = {}) => ({
  series, termId,
  label: series, parentLabel: null, blurb: "", slug: series,
  moduleCount: 6, hasHomework: true, posterId: null,
  opensAt: "2026-10-05T00:00:00Z", started: true, fullyOpen: false,
  ...over,
}) satisfies CourseBlock;

const open = block("tajweed", 1);
const later = block("tajweed", 3, { started: false, opensAt: "2027-03-15T00:00:00Z" });
const empty = block("qaidah", null, { moduleCount: 0, started: false, opensAt: null });

describe("splitCourses", () => {
  it("shuts a course that has not opened yet", () => {
    const { mine, locked } = splitCourses([open, later, empty], null);
    expect(mine).toEqual([open]);
    expect(locked.map((l) => l.reason)).toEqual(["later", "not-running"]);
  });

  it("opens everything with content to a reader exempt from the calendar", () => {
    const { mine, locked } = splitCourses([open, later, empty], null, true);
    expect(mine).toEqual([open, later]);
    // A course the app holds nothing for stays shut for them too — there is
    // nothing behind it to open.
    expect(locked).toEqual([{ block: empty, reason: "not-running" }]);
  });

  it("overrides a class timetable that would have excluded the course", () => {
    const { mine } = splitCourses([open, later], ["umm_al_kitab"], true);
    expect(mine).toEqual([open, later]);
    // …and without the exemption, that timetable still decides.
    expect(splitCourses([open, later], ["umm_al_kitab"]).mine).toEqual([]);
  });
});
