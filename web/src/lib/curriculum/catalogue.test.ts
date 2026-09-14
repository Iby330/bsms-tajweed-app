import { describe, it, expect } from "vitest";
import { buildCatalogue, courseIndex, type CatalogueRow } from "./catalogue";
import {
  buildTree, findCourse,
  type ClassSchedule, type TermRow, type WeekRow, type HomeworkRow, type LessonRow,
} from "./tree";

/* ── The year, in miniature ───────────────────────────────────────────────
 *
 * Two terms. Ghunna's rows sit in Term 1's weeks and Mudūd's in Term 3's —
 * which is the whole difficulty, because group 1 takes Mudūd in Term 1.
 */
const terms: TermRow[] = [
  { id: 1, starts_on: "2026-10-05", ends_on: "2026-11-26", exam_max: 89 },
  { id: 3, starts_on: "2027-03-15", ends_on: "2027-05-20", exam_max: 98 },
];
const weeks: WeekRow[] = [
  { id: "w1", term_id: 1, number: 1, unlock_at: "2026-10-05T00:00:00Z" },
  { id: "w2", term_id: 1, number: 2, unlock_at: "2026-10-12T00:00:00Z" },
  { id: "w31", term_id: 3, number: 1, unlock_at: "2027-03-15T00:00:00Z" },
];
const lesson = (id: string, week: string, course: string, ordinal: number, series: string) => ({
  id, week_id: week, course_id: course, ordinal, series,
  title: id, youtube_id: `yt-${id}`, position: ordinal,
}) satisfies LessonRow;
const homework = (id: string, week: string, course: string, ordinal: number, series: string) => ({
  id, week_id: week, course_id: course, ordinal, number: ordinal, series,
  title: id, total_marks: 10, due_at: null, is_graded: true,
}) satisfies HomeworkRow;

const ALL_LESSONS = [
  lesson("g1", "w1", "GH", 1, "tajweed"),
  lesson("g2", "w2", "GH", 2, "tajweed"),
  lesson("m1", "w31", "MU", 1, "tajweed"),
  lesson("u1", "w1", "UK", 1, "umm_al_kitab"),
];
const ALL_HOMEWORKS = [
  homework("gh1", "w1", "GH", 1, "tajweed"),
  homework("mh1", "w31", "MU", 1, "tajweed"),
];
const KEYS = new Map([["GH", "ghunna"], ["MU", "mudood"], ["UK", "ummul_kitab"]]);

/** The catalogue is read with the service role, so it always holds everything. */
const cat = (now: Date) =>
  buildCatalogue(
    weeks,
    ALL_LESSONS as unknown as CatalogueRow[],
    ALL_HOMEWORKS as unknown as CatalogueRow[],
    now,
    KEYS,
  );

/** A week into Term 1. Term 3 is five months off. */
const NOW = new Date("2026-10-12T09:00:00Z");

/** Group 1: takes Ghunna AND Mudūd in Term 1, and Umm al-Kitāb not at all. */
const groupOne: ClassSchedule = {
  courses: [
    { courseId: "GH", key: "ghunna", label: "Ghunna", termId: 1, position: 1 },
    { courseId: "MU", key: "mudood", label: "Mudūd", termId: 1, position: 2 },
  ],
  firstUnlockByTerm: { 1: "2026-10-05T00:00:00Z", 3: "2027-03-15T00:00:00Z" },
};

/** Group 2: takes Mudūd in Term 3, where its rows already live. */
const groupTwo: ClassSchedule = {
  courses: [
    { courseId: "GH", key: "ghunna", label: "Ghunna", termId: 1, position: 1 },
    { courseId: "MU", key: "mudood", label: "Mudūd", termId: 3, position: 1 },
  ],
  firstUnlockByTerm: groupOne.firstUnlockByTerm,
};

/**
 * What RLS actually hands a student: only the rows their class has reached.
 * Nothing else in this file is honest without it — the bug being pinned here
 * only exists because the tree is a partial view and the catalogue is not.
 */
const asSeenBy = (schedule: ClassSchedule | null, now: Date) => {
  const released = (courseId: string, termId: number) => {
    const at = schedule?.courses.find((c) => c.courseId === courseId)?.termId ?? termId;
    return Date.parse(schedule ? schedule.firstUnlockByTerm[at] : "") <= now.getTime();
  };
  const weekTerm = new Map(weeks.map((w) => [w.id, w.term_id]));
  const visible = <T extends { week_id: string; course_id: string }>(rows: T[]) =>
    rows.filter((r) =>
      schedule
        ? released(r.course_id, weekTerm.get(r.week_id)!)
        : Date.parse(weeks.find((w) => w.id === r.week_id)!.unlock_at) <= now.getTime());
  return {
    terms, weeks,
    lessons: visible(ALL_LESSONS) as LessonRow[],
    homeworks: visible(ALL_HOMEWORKS) as HomeworkRow[],
  };
};

describe("courseIndex", () => {
  /**
   * THE REGRESSION. The index used to key its tiles off the catalogue, which
   * is keyed by where the ROWS live, and linked them at a (term, series) pair
   * the student's own tree does not hold. Every tile 404'd for all five
   * classes with a syllabus.
   */
  it("links every open tile at a course the student's tree actually holds", () => {
    for (const [name, schedule] of [
      ["group 1", groupOne], ["group 2", groupTwo], ["no syllabus", null],
    ] as const) {
      const tree = buildTree(asSeenBy(schedule, NOW), NOW, schedule);
      const { mine } = courseIndex(cat(NOW), tree, schedule !== null);
      expect(mine.length, name).toBeGreaterThan(0);
      for (const tile of mine) {
        const [, , term, series] = tile.href!.split("/");
        expect(findCourse(tree, Number(term), series), `${name} → ${tile.href}`).not.toBeNull();
      }
    }
  });

  it("puts a course the class takes early in the term they take it in", () => {
    const tree = buildTree(asSeenBy(groupOne, NOW), NOW, groupOne);
    const { mine } = courseIndex(cat(NOW), tree, true);
    // Mudūd's rows are filed under Term 3; group 1 opens it in Term 1.
    expect(mine.map((t) => t.href)).toContain("/courses/1/mudood");
    expect(mine.map((t) => t.href)).not.toContain("/courses/3/tajweed");
  });

  it("shows a course another class is on as somebody else's, not as coming", () => {
    const tree = buildTree(asSeenBy(groupOne, NOW), NOW, groupOne);
    const { mine, locked } = courseIndex(cat(NOW), tree, true);
    // Group 1 does not take Umm al-Kitāb at all.
    expect(mine.some((t) => t.block.series.includes("umm"))).toBe(false);
    const uk = locked.find((t) => t.block.series === "umm_al_kitab")!;
    expect(uk.reason).toBe("not-running");
  });

  it("dates a course the class has not reached by THEIR calendar, and sizes it from the catalogue", () => {
    const tree = buildTree(asSeenBy(groupTwo, NOW), NOW, groupTwo);
    const { locked } = courseIndex(cat(NOW), tree, true);
    const mudood = locked.find((t) => t.block.label === "Mudūd")!;
    expect(mudood.reason).toBe("later");
    // Group 2 takes it in Term 3, which opens on the 15th of March.
    expect(mudood.block.opensAt).toBe("2027-03-15T00:00:00.000Z");
    // RLS gave the student none of its rows; the tile still knows it is there.
    expect(mudood.block.moduleCount).toBe(1);
    // …and gives nothing behind the lock away.
    expect(mudood.block.posterId).toBeNull();
  });

  it("leaves a class with no syllabus exactly as it was", () => {
    const tree = buildTree(asSeenBy(null, NOW), NOW, null);
    const { mine, locked } = courseIndex(cat(NOW), tree, false);
    expect(mine.map((t) => t.href).sort())
      .toEqual(["/courses/1/tajweed", "/courses/1/umm_al_kitab"]);
    // Term 3's tajweed is theirs too — just not yet.
    expect(locked.find((t) => t.block.termId === 3)!.reason).toBe("later");
  });

  it("opens the whole programme to a reader exempt from the calendar", () => {
    // `unlockAll` puts the tree back on the whole programme, and RLS has
    // already handed that reader every row.
    const rows = { terms, weeks, lessons: ALL_LESSONS, homeworks: ALL_HOMEWORKS };
    const tree = buildTree(rows, NOW, groupOne, true);
    const { mine, locked } = courseIndex(cat(NOW), tree, false);
    expect(mine.map((t) => t.href).sort())
      .toEqual(["/courses/1/tajweed", "/courses/1/umm_al_kitab", "/courses/3/tajweed"]);
    // All that is left is the two series the app holds no content for at all.
    expect(locked.map((t) => t.block.series).sort()).toEqual(["seerah", "tfp"]);
    expect(locked.every((t) => t.block.moduleCount === 0)).toBe(true);
  });

  it("carries the catalogue's cover art and topic name onto the tile", () => {
    const tree = buildTree(asSeenBy(null, NOW), NOW, null);
    const { mine } = courseIndex(cat(NOW), tree, false);
    const t1 = mine.find((t) => t.href === "/courses/1/tajweed")!;
    // Without a syllabus the tree can only say "Tajweed"; the catalogue names
    // what the term is actually about, and owns the cover image.
    expect(t1.block.label).toBe("Noon & Meem Sākin");
    expect(t1.block.slug).toBe("tajweed-noon-meem-sakin");
    expect(t1.block.posterId).toBe("yt-g1");
  });

  /**
   * Masjid Al-Aqsa's whole Term 1 is a course the app holds nothing for. The
   * top half of their index is empty, which is honest; the bottom half must
   * not then tell them the course they sit in every week is not taught.
   */
  it("separates a course with nothing in it from one another class is on", () => {
    const theirs: ClassSchedule = {
      courses: [
        { courseId: "QA", key: "qaidah", label: "Qāʿidah Nūrāniyyah", termId: 1, position: 1 },
      ],
      firstUnlockByTerm: groupOne.firstUnlockByTerm,
    };
    const tree = buildTree(asSeenBy(theirs, NOW), NOW, theirs);
    const { mine, locked } = courseIndex(cat(NOW), tree, true);
    expect(mine).toEqual([]);
    expect(locked.find((t) => t.block.label === "Qāʿidah Nūrāniyyah")!.reason).toBe("no-content");
    // Ghunna, by contrast, really is somebody else's.
    expect(locked.find((t) => t.block.slug === "tajweed-noon-meem-sakin")!.reason)
      .toBe("not-running");
  });

  it("keeps the teacher's own name for the course under a syllabus", () => {
    const tree = buildTree(asSeenBy(groupOne, NOW), NOW, groupOne);
    const { mine } = courseIndex(cat(NOW), tree, true);
    expect(mine.find((t) => t.href === "/courses/1/ghunna")!.block.label).toBe("Ghunna");
  });
});
