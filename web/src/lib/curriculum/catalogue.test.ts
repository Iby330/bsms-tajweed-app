import { describe, it, expect } from "vitest";
import { buildCatalogue, courseIndex, termIndex, type CatalogueRow, type CourseBlock } from "./catalogue";
import { COURSES } from "./syllabus";
import {
  buildTree, findCourse,
  type ClassSchedule, type TermRow, type WeekRow, type HomeworkRow, type LessonRow,
  type Course, type Term,
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
  { id: "w1", term_id: 1, number: 1, unlock_at: "2026-10-05T00:00:00Z", due_at: null },
  { id: "w2", term_id: 1, number: 2, unlock_at: "2026-10-12T00:00:00Z", due_at: null },
  { id: "w31", term_id: 3, number: 1, unlock_at: "2027-03-15T00:00:00Z", due_at: null },
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
    // ...and is dressed in the catalogue's poster, which gives nothing away.
    expect(mudood.block.posterId).toBe("yt-m1");
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

describe("termIndex", () => {
  /** A course as the tree hands it over, without building a whole tree. */
  const course = (
    series: string, label: string, unlocked: number, modules: number, opensAt: string | null = null,
  ) => ({
    termId: 1, series, label, blurb: "", modules: [], moduleCount: modules,
    unlockedCount: unlocked, actionableCount: unlocked, doneCount: 0,
    hasHomework: modules > 0, opensAt, nextModule: null,
  }) as Course;
  const term = (
    id: number, courses: Course[], lockedWeeks: { number: number; unlockAt: string }[] = [],
    /** Defaults keep every week "locked" — i.e. the term has not begun —
     *  unless a test explicitly says otherwise, which is what every case
     *  below except the "begun, nothing linkable" one needs. */
    opts: { weekCount?: number; actionableCount?: number; doneCount?: number } = {},
  ) => ({
    id, startsOn: "2026-10-05", endsOn: "2026-11-26", examMax: 80, isCurrent: id === 1,
    courses, moduleCount: 0,
    actionableCount: opts.actionableCount ?? 5,
    doneCount: opts.doneCount ?? 2,
    weekCount: opts.weekCount ?? lockedWeeks.length,
    lockedWeeks,
  }) as Term;

  it("covers a term with the first video of each course, two at most", () => {
    // group 1 takes Ghunna and Mudūd in Term 1; group 2 meets Mudūd only in Term 3
    const one = termIndex(cat(NOW), buildTree(asSeenBy(groupOne, NOW), NOW, groupOne), true);
    expect(one.terms.find((t) => t.id === 1)!.posters).toEqual(["yt-g1", "yt-m1"]);
    const two = termIndex(cat(NOW), buildTree(asSeenBy(groupTwo, NOW), NOW, groupTwo), true);
    // locked, but the catalogue's poster still dresses it
    expect(two.terms.find((t) => t.id === 3)!.posters).toEqual(["yt-m1"]);
  });

  it("opens the current term and links each course that has started", () => {
    const tree = buildTree(asSeenBy(groupOne, NOW), NOW, groupOne);
    const { terms: tiles } = termIndex(cat(NOW), tree, true);
    const t1 = tiles.find((t) => t.id === 1)!;
    expect(t1.open).toBe(true);
    expect(t1.href).toBe("/courses/1");
    expect(t1.courses.map((c) => c.href)).toEqual(["/courses/1/ghunna", "/courses/1/mudood"]);
    expect(t1.opensAt).toBeNull();
  });

  it("reads a begun term as open even when nothing in it is linkable yet", () => {
    // Al-Aqsa's Term 1: it is running (weeks have unlocked), but its one
    // course, Qāʿidah, has no content at all — moduleCount 0 — so there is
    // nothing anywhere in the term to click. It must not read as locked and
    // date itself "Opens <past date>".
    const { terms: tiles } = termIndex([], [term(1, [
      course("qaidah", "Qāʿidah Nūrāniyyah", 0, 0),
    ], [], { weekCount: 5, actionableCount: 0, doneCount: 0 })], true);
    expect(tiles[0].open).toBe(true);
    expect(tiles[0].href).toBeNull();
    expect(tiles[0].opensAt).toBeNull();
    expect(tiles[0].progress).toBeNull();
    expect(tiles[0].courses).toEqual([
      { key: "qaidah", label: "Qāʿidah Nūrāniyyah", href: null },
    ]);
  });

  it("never links a course in the open term that has not started or is empty", () => {
    const { terms: tiles } = termIndex([], [term(1, [
      course("ghunna", "Ghunna", 2, 8),
      course("mudood", "Mudūd", 0, 6, "2026-10-29T13:00:00Z"),
      course("sifaat_new", "Ṣifāt series", 0, 0),
    ])], true);
    expect(tiles[0].open).toBe(true);
    expect(tiles[0].courses).toEqual([
      { key: "ghunna", label: "Ghunna", href: "/courses/1/ghunna" },
      { key: "mudood", label: "Mudūd", href: null },
      { key: "sifaat_new", label: "Ṣifāt series", href: null },
    ]);
    expect(tiles[0].progress).toEqual({ done: 2, total: 5 });
  });

  it("links nothing in a term that has not opened, and says when it opens", () => {
    const { terms: tiles } = termIndex([], [term(2, [
      course("sifaat_old", "Ṣifāt", 0, 7, "2026-12-31T13:00:00Z"),
    ])], true);
    expect(tiles[0]).toMatchObject({
      open: false, href: null, opensAt: "2026-12-31T13:00:00Z", progress: null,
      courses: [{ key: "sifaat_old", label: "Ṣifāt", href: null }],
    });
  });

  it("dates a term with nothing planned by its first week, naming no courses", () => {
    const { terms: tiles } = termIndex([], [term(3, [], [
      { number: 2, unlockAt: "2027-03-18T13:00:00Z" },
      { number: 1, unlockAt: "2027-03-11T13:00:00Z" },
    ])], true);
    expect(tiles[0]).toMatchObject({ open: false, href: null, courses: [], opensAt: "2027-03-11T13:00:00Z" });
  });

  it("dates a locked term by its earliest course, even out of order, ahead of its weeks", () => {
    const { terms: tiles } = termIndex([], [term(2, [
      course("mudood", "Mudūd", 0, 6, "2026-12-31T13:00:00Z"),
      course("sifaat_old", "Ṣifāt", 0, 7, "2026-11-20T13:00:00Z"),
    ], [
      { number: 1, unlockAt: "2026-10-15T13:00:00Z" },
    ])], true);
    // The weeks' own date is earlier than either course's, but course dates
    // win: weeks are only a fallback for a term with nothing planned at all.
    expect(tiles[0].opensAt).toBe("2026-11-20T13:00:00Z");
  });

  it("dates a later term by the class's own calendar", () => {
    const tree = buildTree(asSeenBy(groupTwo, NOW), NOW, groupTwo);
    const t3 = termIndex(cat(NOW), tree, true).terms.find((t) => t.id === 3)!;
    expect(t3.open).toBe(false);
    expect(t3.courses.map((c) => c.href)).toEqual([null]);
    expect(Date.parse(t3.opensAt!)).toBe(Date.parse("2027-03-15T00:00:00Z"));
  });

  it("puts every course outside the plan in the rest of the programme, content or not", () => {
    const tree = buildTree(asSeenBy(groupTwo, NOW), NOW, groupTwo);
    const { rest } = termIndex(cat(NOW), tree, true);
    // Group 2 takes Ghunna (Term 1) and Mudūd (Term 3): neither shows up here.
    // Everything else COURSES names does — "Ṣifāt", "Mabādi'" and "Umm
    // al-Kitāb" all have rows somewhere in the catalogue; "Ṣifāt series",
    // "Makhārij series" and "Qāʿidah Nūrāniyyah" have none at all, which used
    // to mean no tile for them (the live bug this fixes) — and still get one,
    // by COURSES' own label, not whatever topic name a shared block carries.
    expect(rest.map((t) => t.block.label)).toEqual([
      "Ṣifāt", "Mabādi'", "Umm al-Kitāb", "Ṣifāt series", "Makhārij series", "Qāʿidah Nūrāniyyah",
      "Ten Fundamental Principles", "Seerah",
    ]);
    expect(rest.some((t) => t.block.series === "ghunna" || t.block.series === "mudood")).toBe(false);
    // Seerah and TFP have no course row at all (`courseKey: null`) — COURSES
    // cannot name them, so they are appended from the catalogue directly,
    // which is why they trail the course-based tiles (last two above)
    // instead of leading them.
    expect(rest.slice(-2).map((t) => t.block.series)).toEqual(["tfp", "seerah"]);
    expect(rest.every((t) => t.href === null)).toBe(true);
  });

  it("shows a series never tied to its course once, as that course, and not to a class taking it", () => {
    const block = (o: Partial<CourseBlock>) => ({
      series: "x", termId: null, label: "x", parentLabel: null, blurb: "", slug: "x",
      courseKey: null, moduleCount: 0, hasHomework: false, posterId: null,
      opensAt: null, started: false, fullyOpen: false, ...o,
    }) as CourseBlock;
    // Mabādi's lessons live in the "tfp" series, Term 3: rows with no course id
    const tfp = block({ series: "tfp", termId: 3, label: "Ten Fundamental Principles", moduleCount: 7, posterId: "yt-t1" });

    const without = termIndex([tfp], [term(1, [course("ghunna", "Ghunna", 1, 8)])], true).rest;
    const shown = without.filter((t) => t.block.series === "tfp");
    expect(shown).toHaveLength(1);
    expect(shown[0].block.label).toBe(COURSES.mabadi.label);
    expect(shown[0].block.posterId).toBe("yt-t1");

    const taking = termIndex([tfp], [term(3, [course("mabadi", COURSES.mabadi.label, 0, 7)])], true).rest;
    expect(taking.some((t) => t.block.series === "tfp")).toBe(false);
  });

  it("leaves the rest empty for a reader on the whole programme", () => {
    const tree = buildTree(asSeenBy(null, NOW), NOW, null);
    expect(termIndex(cat(NOW), tree, false).rest).toEqual([]);
  });
});
