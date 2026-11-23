import { describe, it, expect } from "vitest";
import type { EditorItem, LibraryItem } from "@/lib/curriculum/schedule-editor-data";
import { scheduleFromRows, type ScheduleInput } from "@/lib/curriculum/schedule-rows";
import type { ClassSchedule, WeekRow } from "@/lib/curriculum/tree";
import { itemState } from "./dates";
import { apply, keyOf, working, type Op, type Working } from "./optimistic";

// Term 1 and Term 2, eight weeks each, a week apart
const weeks: WeekRow[] = [1, 2].flatMap((t) => Array.from({ length: 8 }, (_, i) => ({
  id: `w${t}${i + 1}`, term_id: t, number: i + 1,
  unlock_at: new Date(Date.parse(t === 1 ? "2026-10-01T12:00:00Z" : "2027-01-07T13:00:00Z") + i * 7 * 864e5).toISOString(),
  due_at: new Date(Date.parse(t === 1 ? "2026-10-04T17:00:00Z" : "2027-01-10T18:00:00Z") + i * 7 * 864e5).toISOString(),
})));
const rows = (over: Partial<ScheduleInput> = {}): ScheduleInput => ({
  rows: [
    { course_id: "GH", term_id: 1, position: 1, due_days_after_unlock: null, courses: { key: "ghunna", label: "Ghunna" } },
    { course_id: "SF", term_id: 2, position: 1, due_days_after_unlock: null, courses: { key: "sifaat", label: "Ṣifāt" } },
  ],
  items: [], section: null, rule: null, weeks, sectionWeeks: [], dates: [], holds: [], added: [],
  ...over,
});

const lib = (courseId: string, ordinal: number, over: Partial<LibraryItem> = {}): LibraryItem => ({
  courseId, courseKey: courseId.toLowerCase(), courseLabel: courseId, coursePosition: { GH: 1, SF: 2, MD: 3 }[courseId] ?? 9,
  ordinal, title: `${courseId} ${ordinal}`, hasVideo: true, hwNumber: 100 + ordinal, lessonId: `l-${courseId}${ordinal}`, hwId: `h-${courseId}${ordinal}`,
  homeTermId: courseId === "GH" ? 1 : courseId === "SF" ? 2 : null,
  placed: courseId === "GH" ? { termId: 1, week: ordinal } : courseId === "SF" ? { termId: 2, week: ordinal } : null,
  removed: false, resource: false, ...over,
});
const item = (courseId: string, ordinal: number, over: Partial<EditorItem> = {}): EditorItem => ({
  courseId, ordinal, title: `${courseId} ${ordinal}`, lessonId: `l-${courseId}${ordinal}`, hasVideo: true,
  homework: { id: `h-${courseId}${ordinal}`, number: 100 + ordinal }, handedIn: 3, marked: 2, late: 1, ...over,
});

function base(schedule: ClassSchedule = scheduleFromRows(rows())!): Working {
  const library = ["GH", "SF", "MD"].flatMap((c) => [1, 2, 3].map((o) => lib(c, o)));
  const items = ["GH", "SF"].flatMap((c) => [1, 2, 3].map((o) => item(c, o)));
  return working({ schedule, items, library });
}
const state = (w: Working, c: string, o: number) => itemState(w.schedule, c, o, true);
const libOf = (w: Working, c: string, o: number) => w.library.find((x) => x.courseId === c && x.ordinal === o)!;
const has = (w: Working, c: string, o: number) => w.items.some((x) => keyOf(x) === `${c}|${o}`);
const stamp = { by: "me", at: "2026-11-22T10:00:00.000Z" };

describe("apply: place a taken course's item in another term, then undo", () => {
  const w0 = base();
  const placed = apply(w0, { t: "place", item: { courseId: "SF", ordinal: 3 }, termId: 1, week: 8 });

  it("meets it in Term 1 week 8, with Term 1 week 8's dates", () => {
    const s = state(placed, "SF", 3);
    expect(s).toMatchObject({ termId: 1, courseTermId: 2, week: 8 });
    expect(s.opens).toBe(weeks.find((x) => x.term_id === 1 && x.number === 8)!.unlock_at);
    expect(libOf(placed, "SF", 3).placed).toEqual({ termId: 1, week: 8 });
    expect(placed.schedule.itemTerms).toEqual({ SF: { 3: 1 } });
    expect(placed.schedule.itemWeeks).toEqual({ SF: { 3: 8 } });
  });

  it("builds what the server's rows would", () => {
    const server = scheduleFromRows(rows({ items: [{ course_id: "SF", ordinal: 3, week_number: 8, term_id: 1 }] }))!;
    expect(placed.schedule.itemTerms).toEqual(server.itemTerms);
    expect(placed.schedule.itemWeeks).toEqual(server.itemWeeks);
  });

  it("leaves the working copy it was given alone", () => {
    expect(state(w0, "SF", 3)).toMatchObject({ termId: 2, week: 3 });
    expect(w0.schedule.itemTerms).toEqual({});
  });

  it("puts it back where it was with restorePlacement's snapshot", () => {
    const undone = apply(placed, { t: "unplace", item: { courseId: "SF", ordinal: 3 }, before: { termId: null, week: null, dates: null }, ...stamp });
    expect(state(undone, "SF", 3)).toMatchObject({ termId: 2, week: 3 });
    expect(undone.schedule.itemTerms).toEqual({});
    expect(undone.schedule.itemWeeks).toEqual({});
    expect(libOf(undone, "SF", 3).placed).toEqual({ termId: 2, week: 3 });
  });

  it("deletes the override when put back in its own week of its own term", () => {
    const back = apply(placed, { t: "place", item: { courseId: "SF", ordinal: 3 }, termId: 2, week: 3 });
    expect(back.schedule.itemWeeks).toEqual({});
    expect(back.schedule.itemTerms).toEqual({});
  });

  it("drops the dates set for the week it left, and the undo puts them back", () => {
    const own = apply(w0, { t: "dates", keys: [{ courseId: "SF", ordinal: 3 }], patch: { dueAt: "2027-02-01T18:00:00.000Z" }, ...stamp });
    const moved = apply(own, { t: "place", item: { courseId: "SF", ordinal: 3 }, termId: 1, week: 8 });
    expect(state(moved, "SF", 3).own).toBeUndefined();
    const undone = apply(moved, {
      t: "unplace", item: { courseId: "SF", ordinal: 3 },
      before: { termId: null, week: null, dates: { opensAt: null, dueAt: "2027-02-01T18:00:00.000Z", held: null } }, ...stamp,
    });
    expect(state(undone, "SF", 3).due).toBe("2027-02-01T18:00:00.000Z");
  });
});

describe("apply: place an item of a course the class does not take", () => {
  const w0 = base();
  const one = apply(w0, { t: "place", item: { courseId: "MD", ordinal: 2 }, termId: 2, week: 4 });

  it("adds the course, carrying only that item, and lists it", () => {
    const md = one.schedule.courses.find((c) => c.courseId === "MD");
    expect(md).toMatchObject({ added: true, termId: 2, ordinals: [2], key: "md", label: "MD" });
    expect(state(one, "MD", 2)).toMatchObject({ termId: 2, week: 4 });
    expect(has(one, "MD", 2)).toBe(true);
    expect(has(one, "MD", 1)).toBe(false);
    const row = one.items.find((x) => keyOf(x) === "MD|2")!;
    expect(row).toMatchObject({ handedIn: 0, homework: { id: "h-MD2", number: 102 }, lessonId: "l-MD2" });
    expect(libOf(one, "MD", 2).placed).toEqual({ termId: 2, week: 4 });
    expect(libOf(one, "MD", 1).placed).toBeNull();
  });

  it("files the course under its earliest term, as the server does", () => {
    const two = apply(one, { t: "place", item: { courseId: "MD", ordinal: 1 }, termId: 1, week: 6 });
    const server = scheduleFromRows(rows({
      added: [
        { course_id: "MD", ordinal: 2, term_id: 2, week_number: 4, courses: { key: "md", label: "MD" } },
        { course_id: "MD", ordinal: 1, term_id: 1, week_number: 6, courses: { key: "md", label: "MD" } },
      ],
    }))!;
    expect(two.schedule.courses.find((c) => c.courseId === "MD")).toMatchObject({ termId: 1, ordinals: [1, 2] });
    expect(two.schedule.itemTerms).toEqual(server.itemTerms);
    expect(two.schedule.itemWeeks).toEqual(server.itemWeeks);
    expect(state(two, "MD", 2)).toMatchObject({ termId: 2, week: 4 });
    expect(state(two, "MD", 1)).toMatchObject({ termId: 1, week: 6 });
  });

  it("takes the course off the schedule when its last item goes (removeAddedItem, and placeItem's undo)", () => {
    const gone = apply(one, { t: "unadd", item: { courseId: "MD", ordinal: 2 } });
    expect(gone.schedule.courses.some((c) => c.courseId === "MD")).toBe(false);
    expect(has(gone, "MD", 2)).toBe(false);
    expect(libOf(gone, "MD", 2).placed).toBeNull();
    const undone = apply(one, { t: "unplace", item: { courseId: "MD", ordinal: 2 }, before: { termId: null, week: null, dates: null }, ...stamp });
    expect(undone.schedule.courses.some((c) => c.courseId === "MD")).toBe(false);
  });
});

describe("apply: remove one of the class's own items", () => {
  const w0 = base();
  const op: Op = { t: "dates", keys: [{ courseId: "GH", ordinal: 2 }], patch: { held: true }, ...stamp };
  const gone = apply(w0, op);

  it("holds it, takes it off the list and marks it removed in the library", () => {
    expect(gone.schedule.itemDates?.GH?.[2]).toMatchObject({ held: true, opensAt: null, dueAt: null, setBy: "me" });
    expect(has(gone, "GH", 2)).toBe(false);
    expect(libOf(gone, "GH", 2)).toMatchObject({ removed: true, placed: null });
  });

  it("comes back with its hand-in counts when the undo puts its row back", () => {
    const back = apply(gone, { t: "rows", rows: [{ courseId: "GH", ordinal: 2, row: null }], ...stamp });
    expect(back.items.find((x) => keyOf(x) === "GH|2")).toMatchObject({ handedIn: 3, marked: 2, late: 1 });
    expect(libOf(back, "GH", 2)).toMatchObject({ removed: false, placed: { termId: 1, week: 2 } });
  });

  it("comes back on the schedule when placed in a week (placeItem clears the hold)", () => {
    const placed = apply(gone, { t: "place", item: { courseId: "GH", ordinal: 2 }, termId: 1, week: 5 });
    expect(state(placed, "GH", 2)).toMatchObject({ held: false, week: 5, own: undefined });
    expect(placed.items.find((x) => keyOf(x) === "GH|2")).toMatchObject({ handedIn: 3 });
  });
});

describe("apply: dates", () => {
  const w0 = base();

  it("leaves an omitted field alone and clears a null one", () => {
    const a = apply(w0, { t: "dates", keys: [{ courseId: "GH", ordinal: 1 }], patch: { opensAt: "2026-09-30T12:00:00.000Z", dueAt: "2026-10-05T17:00:00.000Z" }, ...stamp });
    const b = apply(a, { t: "dates", keys: [{ courseId: "GH", ordinal: 1 }], patch: { dueAt: null }, ...stamp });
    expect(b.schedule.itemDates?.GH?.[1]).toMatchObject({ opensAt: "2026-09-30T12:00:00.000Z", dueAt: null, held: null });
    expect(state(b, "GH", 1)).toMatchObject({ opens: "2026-09-30T12:00:00.000Z", opensSrc: "own", dueSrc: "calendar" });
  });

  it("drops a row that has nothing left in it, back to the default dates", () => {
    const a = apply(w0, { t: "dates", keys: [{ courseId: "GH", ordinal: 1 }], patch: { opensAt: "2026-09-30T12:00:00.000Z" }, ...stamp });
    const b = apply(a, { t: "dates", keys: [{ courseId: "GH", ordinal: 1 }], patch: { opensAt: null, dueAt: null }, ...stamp });
    expect(b.schedule.itemDates?.GH).toBeUndefined();
    expect(state(b, "GH", 1)).toEqual(state(w0, "GH", 1));
  });

  it("changes several at once, and the class rule moves the rest", () => {
    const a = apply(w0, { t: "dates", keys: [{ courseId: "GH", ordinal: 1 }, { courseId: "SF", ordinal: 2 }], patch: { held: false }, ...stamp });
    expect(a.schedule.itemDates?.GH?.[1]?.held).toBe(false);
    expect(a.schedule.itemDates?.SF?.[2]?.held).toBe(false);
    const r = apply(w0, { t: "rule", rule: { open: null, due: { weekday: 1, time: "14:00", weeksAfter: 0 } } });
    expect(state(r, "GH", 1).dueSrc).toBe("class");
    expect(state(r, "GH", 1).due).not.toBe(state(w0, "GH", 1).due);
  });

  it("does nothing with no change, which is what an error leaves", () => {
    expect(apply(w0, null)).toBe(w0);
  });
});
