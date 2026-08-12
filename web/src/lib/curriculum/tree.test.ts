import { describe, it, expect } from "vitest";
import {
  buildTree, overlayProgress, findCourse, findCurrentModule, moduleTitle,
  listHomework, bucketHomework, weekContent,
  type TermRow, type WeekRow, type LessonRow, type HomeworkRow,
} from "./tree";

/* ── moduleTitle — exercised against the REAL seed strings, because this is
 *    the one function that can silently mangle live content ─────────────── */

describe("moduleTitle", () => {
  /* Two separators are live at once: the SQL seed writes "Tajweed 3 — …",
   * the Forms import writes "Tajweed 3: …". Both must clean identically. */
  it("strips the series+number prefix, em dash or colon", () => {
    expect(moduleTitle("Umm al-Kitab 1 — Names, virtues and importance of Surah Al-Fatiha"))
      .toBe("Names, virtues and importance of Surah Al-Fatiha");
    expect(moduleTitle("Umm al-Kitab 4 — Verse 2")).toBe("Verse 2");
    expect(moduleTitle("Tajweed 10 — The Heaviness of Laam")).toBe("The Heaviness of Laam");
    // the shapes actually stored in the database today
    expect(moduleTitle("Tajweed 10: The Heaviness of Laam")).toBe("The Heaviness of Laam");
    expect(moduleTitle("Tajweed 11: The Heaviness of Ra")).toBe("The Heaviness of Ra");
    expect(moduleTitle("Tajweed 18: Madd Munfasil")).toBe("Madd Munfasil");
    expect(moduleTitle("Tajweed 19: Maddul A’arid + Recitation Speeds"))
      .toBe("Maddul A’arid + Recitation Speeds");
  });

  it("strips the doubled-up homework label too", () => {
    expect(moduleTitle("Tajweed 1 — Tajweed Homework: Introduction")).toBe("Introduction");
    expect(moduleTitle("Tajweed 3 — Tajweed Homework 3: Idhaar Halqy ")).toBe("Idhaar Halqy");
    expect(moduleTitle("Tajweed 4 — Tajweed Homework 4 : Idghaam of Noon Sakin/Tanween   "))
      .toBe("Idghaam of Noon Sakin/Tanween");
    expect(moduleTitle("Tajweed 21 — Tajweed Homework 21 :  Waqf wa Ibtidah Waqf wa Ibtidah "))
      .toBe("Waqf wa Ibtidah Waqf wa Ibtidah");
    expect(moduleTitle("Tajweed 19 — Tajweed Homework 19: Maddul A’arid + Recitation Speeds"))
      .toBe("Maddul A’arid + Recitation Speeds");
    // colon form, as stored
    expect(moduleTitle("Tajweed 1: Tajweed Homework: Introduction")).toBe("Introduction");
    expect(moduleTitle("Tajweed 16: Tajweed Homework 16 : Muduud Overview "))
      .toBe("Muduud Overview");
    expect(moduleTitle("Tajweed 12: Tajweed Homework 12 : Qalqala")).toBe("Qalqala");
    expect(moduleTitle("Tajweed 15: Tajweed Homework 15 : Meeting of 2 Sukoons "))
      .toBe("Meeting of 2 Sukoons");
  });

  it("returns empty when the title is only a course name and a number", () => {
    // the real TFP rows carry no title at all
    expect(moduleTitle("The 10 Fundamental Principles: HW 1")).toBe("");
    expect(moduleTitle("The 10 Fundamental Principles: HW 7")).toBe("");
  });

  it("leaves a title that needs no cleaning alone", () => {
    expect(moduleTitle("Idhaar Halqy")).toBe("Idhaar Halqy");
    expect(moduleTitle("Rules of Meem Sakin")).toBe("Rules of Meem Sakin");
    // no false positive on words that merely contain the letters h and w
    expect(moduleTitle("The Showing of Ikhfaa")).toBe("The Showing of Ikhfaa");
  });

  it("never strips a real title down to nothing", () => {
    expect(moduleTitle("Tajweed 5 — Tajweed Homework 5: Iqlaab ")).toBe("Iqlaab");
    expect(moduleTitle("   ")).toBe("");
  });
});

/* A miniature year with the same asymmetry as the real one:
 *   T1 (3 weeks) — Tajweed ×3 + Umm al-Kitab ×2 (no homework, stops early)
 *   T2 (2 weeks) — Tajweed ×2
 *   T3 (2 weeks) — Tajweed ×1 + TFP ×2
 * Week 3 of T1 onwards is locked relative to NOW. */

const NOW = new Date(Date.UTC(2026, 9, 19)); // 19 Oct 2026, a Monday
const day = (n: number) => new Date(Date.UTC(2026, 9, 5) + n * 864e5).toISOString();

const terms: TermRow[] = [
  { id: 1, starts_on: day(0), ends_on: day(20), exam_max: 89 },
  { id: 2, starts_on: day(28), ends_on: day(41), exam_max: 93 },
  { id: 3, starts_on: day(56), ends_on: day(69), exam_max: 98 },
];

const weeks: WeekRow[] = [
  { id: "t1w1", term_id: 1, number: 1, unlock_at: day(0) },   // unlocked
  { id: "t1w2", term_id: 1, number: 2, unlock_at: day(7) },   // unlocked
  { id: "t1w3", term_id: 1, number: 3, unlock_at: day(14) },  // unlocked (NOW = day 14)
  { id: "t2w1", term_id: 2, number: 1, unlock_at: day(28) },  // locked
  { id: "t2w2", term_id: 2, number: 2, unlock_at: day(35) },  // locked
  { id: "t3w1", term_id: 3, number: 1, unlock_at: day(56) },  // locked
  { id: "t3w2", term_id: 3, number: 2, unlock_at: day(63) },  // locked
];

const lesson = (
  id: string, week_id: string, series: string, title: string, position = 1,
  youtube_id: string | null = "abc",
): LessonRow => ({ id, week_id, series, title, youtube_id, position });

const lessons: LessonRow[] = [
  // deliberately out of order — buildTree must sort, not trust the input
  lesson("uak2", "t1w2", "umm_al_kitab", "Al-Isti'adha", 2),
  lesson("taj3", "t1w3", "tajweed", "Idhaar Halqy"),
  lesson("taj1", "t1w1", "tajweed", "Introduction"),
  lesson("uak1", "t1w1", "umm_al_kitab", "Al-Fatiha", 2),
  lesson("taj2", "t1w2", "tajweed", "Ghunna"),
  lesson("taj5", "t2w2", "tajweed", "Ikhfaa"),
  lesson("taj4", "t2w1", "tajweed", "Idghaam"),
  lesson("taj6", "t3w1", "tajweed", "Qalqalah"),
  lesson("tfp1", "t3w1", "tfp", "TFP one", 2),
  lesson("tfp2", "t3w2", "tfp", "TFP two", 2),
];

const hw = (
  id: string, week_id: string, number: number, series: string, title: string,
): HomeworkRow => ({
  id, week_id, number, series, title,
  total_marks: 10, due_at: null, is_graded: true,
});

const homeworks: HomeworkRow[] = [
  hw("h1", "t1w1", 1, "tajweed", "HW 1"),
  hw("h2", "t1w2", 2, "tajweed", "HW 2"),
  hw("h3", "t1w3", 3, "tajweed", "HW 3"),
  hw("h4", "t2w1", 4, "tajweed", "HW 4"),
  hw("h5", "t2w2", 5, "tajweed", "HW 5"),
  hw("h6", "t3w1", 6, "tajweed", "HW 6"),
  hw("h101", "t3w1", 101, "tfp", "TFP HW 1"),
  hw("h102", "t3w2", 102, "tfp", "TFP HW 2"),
];

const tree = () => buildTree({ terms, weeks, lessons, homeworks }, NOW);

describe("buildTree — course derivation", () => {
  it("returns one node per term, in order", () => {
    expect(tree().map((t) => t.id)).toEqual([1, 2, 3]);
  });

  it("derives courses from content present, never a fixed list", () => {
    const [t1, t2, t3] = tree();
    expect(t1.courses.map((c) => c.series)).toEqual(["tajweed", "umm_al_kitab"]);
    expect(t2.courses.map((c) => c.series)).toEqual(["tajweed"]);
    expect(t3.courses.map((c) => c.series)).toEqual(["tajweed", "tfp"]);
  });

  it("labels courses from the shared series map", () => {
    const [t1] = tree();
    expect(t1.courses.map((c) => c.label)).toEqual(["Tajweed", "Umm al-Kitāb"]);
  });

  it("never invents a course for a series with no rows in that term", () => {
    for (const t of tree()) {
      expect(t.courses.every((c) => c.modules.length > 0)).toBe(true);
    }
    expect(tree()[1].courses.find((c) => c.series === "tfp")).toBeUndefined();
  });
});

describe("buildTree — modules", () => {
  it("orders modules by week number regardless of input order", () => {
    const taj = findCourse(tree(), 1, "tajweed")!;
    expect(taj.modules.map((m) => m.weekNumber)).toEqual([1, 2, 3]);
  });

  it("orders lessons within a module by position", () => {
    const w1 = findCourse(tree(), 1, "tajweed")!.modules[0];
    expect(w1.lessons.map((l) => l.id)).toEqual(["taj1"]);
    const uak = findCourse(tree(), 1, "umm_al_kitab")!;
    expect(uak.modules.map((m) => m.lessons[0].id)).toEqual(["uak1", "uak2"]);
  });

  it("stops a course at its last week of content, not the term's last week", () => {
    // Umm al-Kitab runs weeks 1–2 of a 3-week term
    expect(findCourse(tree(), 1, "umm_al_kitab")!.modules.map((m) => m.weekNumber))
      .toEqual([1, 2]);
  });

  it("attaches only the homework matching the course's own series", () => {
    const uak = findCourse(tree(), 1, "umm_al_kitab")!;
    // week 1 HAS a tajweed homework — it must not leak into Umm al-Kitab
    expect(uak.modules.every((m) => m.homework === null)).toBe(true);
    expect(uak.hasHomework).toBe(false);

    const tfp = findCourse(tree(), 3, "tfp")!;
    expect(tfp.modules.map((m) => m.homework?.number)).toEqual([101, 102]);
  });

  it("titles a module from its lesson, falling back to the homework", () => {
    expect(findCourse(tree(), 1, "tajweed")!.modules[0].title).toBe("Introduction");
  });
});

describe("buildTree — locking", () => {
  it("unlocks a week at its unlock_at, inclusive", () => {
    const taj = findCourse(tree(), 1, "tajweed")!;
    expect(taj.modules.map((m) => m.unlocked)).toEqual([true, true, true]);
  });

  it("keeps future terms locked but present", () => {
    const [, t2, t3] = tree();
    expect(t2.courses[0].modules.every((m) => m.unlocked)).toBe(false);
    expect(t3.courses[0].modules.every((m) => m.unlocked)).toBe(false);
    expect(t2.courses[0].modules.length).toBe(2); // visible, not hidden
  });

  /* Students cannot SEE locked lessons or homeworks — the RLS policies
   * s_lessons_unlocked / s_homeworks_unlocked filter those rows out entirely.
   * `weeks` is readable though, so the calendar is the only honest source for
   * "there is more coming". */
  it("reports the term's locked weeks from the calendar, not from content", () => {
    const [t1, t2, t3] = tree();
    expect(t1.lockedWeeks).toEqual([]);
    expect(t2.lockedWeeks.map((w) => w.number)).toEqual([1, 2]);
    expect(t3.lockedWeeks.map((w) => w.number)).toEqual([1, 2]);
    expect(t2.lockedWeeks[0].unlockAt).toBe(day(28));
  });

  it("counts every week in the term, released or not", () => {
    expect(tree().map((t) => t.weekCount)).toEqual([3, 2, 2]);
  });

  it("knows a term's locked weeks even with no visible content at all", () => {
    const bare = buildTree({ terms, weeks, lessons: [], homeworks: [] }, NOW);
    expect(bare[1].lockedWeeks.map((w) => w.number)).toEqual([1, 2]);
    expect(bare[1].courses).toEqual([]);
  });

  it("marks the term containing today as current", () => {
    expect(tree().map((t) => t.isCurrent)).toEqual([true, false, false]);
  });

  it("falls back to the most recently started term between terms", () => {
    const between = new Date(Date.UTC(2026, 9, 5) + 24 * 864e5); // after T1 ends
    expect(buildTree({ terms, weeks, lessons, homeworks }, between)
      .map((t) => t.isCurrent)).toEqual([true, false, false]);
  });
});

describe("overlayProgress", () => {
  const progress = (watched: string[], subs: [string, string][]) =>
    overlayProgress(tree(), {
      watchedLessonIds: new Set(watched),
      submissionByHomeworkId: new Map(subs as [string, never][]),
    });

  it("counts a module done only when its video AND homework are handled", () => {
    const taj = findCourse(progress(["taj1"], []), 1, "tajweed")!;
    expect(taj.modules[0].done).toBe(false); // watched, homework untouched
    expect(taj.doneCount).toBe(0);

    const both = findCourse(progress(["taj1"], [["h1", "submitted"]]), 1, "tajweed")!;
    expect(both.modules[0].done).toBe(true);
    expect(both.doneCount).toBe(1);
  });

  it("does not hold a student hostage to teacher marking", () => {
    // submitted / auto_marked / approved all mean the student has done their part
    for (const status of ["submitted", "auto_marked", "approved"]) {
      const c = findCourse(progress(["taj1"], [["h1", status]]), 1, "tajweed")!;
      expect(c.modules[0].done).toBe(true);
    }
    const draft = findCourse(progress(["taj1"], [["h1", "draft"]]), 1, "tajweed")!;
    expect(draft.modules[0].done).toBe(false);
  });

  /* Most videos are not uploaded yet (youtube_id is null until the channel
   * re-uploads). An unwatchable lesson must not pin a student at 0% forever —
   * "complete" means they did everything that was actually available. */
  it("does not require watching a video that does not exist yet", () => {
    const noVideo = buildTree(
      {
        terms, weeks,
        lessons: [lesson("nv", "t1w1", "tajweed", "No video yet", 1, null)],
        homeworks: [hw("h1", "t1w1", 1, "tajweed", "HW 1")],
      },
      NOW,
    );
    const withHw = overlayProgress(noVideo, {
      watchedLessonIds: new Set<string>(),
      submissionByHomeworkId: new Map([["h1", "approved"]] as [string, never][]),
    });
    const m = findCourse(withHw, 1, "tajweed")!.modules[0];
    expect(m.done).toBe(true);
    expect(m.watched).toBe(false); // never claim they watched something
  });

  it("still blocks on an unwatched video that IS available", () => {
    const m = findCourse(progress([], [["h1", "approved"]]), 1, "tajweed")!.modules[0];
    expect(m.done).toBe(false);
  });

  /* A module with no playable video and no homework offers the student
   * nothing to do. Marking it "complete" would paint a green bar over work
   * nobody did, so it counts as neither done nor outstanding. */
  it("does not call a module with nothing to do 'complete'", () => {
    const bare = buildTree(
      { terms, weeks, lessons: [lesson("nv", "t1w1", "tajweed", "Nothing", 1, null)], homeworks: [] },
      NOW,
    );
    const course = findCourse(
      overlayProgress(bare, { watchedLessonIds: new Set(), submissionByHomeworkId: new Map() }),
      1, "tajweed",
    )!;
    expect(course.modules[0].actionable).toBe(false);
    expect(course.modules[0].done).toBe(false);
    expect(course.doneCount).toBe(0);
    // and it must not inflate the denominator either
    expect(course.actionableCount).toBe(0);
    expect(course.moduleCount).toBe(1);
  });

  it("counts only modules the student can actually act on", () => {
    const mixed = buildTree(
      {
        terms, weeks,
        lessons: [
          lesson("a", "t1w1", "tajweed", "Has video", 1, "vid"),
          lesson("b", "t1w2", "tajweed", "No video", 1, null),
          lesson("c", "t1w3", "tajweed", "No video but homework", 1, null),
        ],
        homeworks: [hw("h3", "t1w3", 3, "tajweed", "HW 3")],
      },
      NOW,
    );
    const course = findCourse(
      overlayProgress(mixed, {
        watchedLessonIds: new Set(["a"]),
        submissionByHomeworkId: new Map([["h3", "approved"]] as [string, never][]),
      }),
      1, "tajweed",
    )!;
    expect(course.moduleCount).toBe(3);
    expect(course.actionableCount).toBe(2); // week 1 (video) + week 3 (homework)
    expect(course.doneCount).toBe(2);
    expect(course.modules.map((m) => m.actionable)).toEqual([true, false, true]);
  });

  it("completes a homework-free module on the video alone", () => {
    const uak = findCourse(progress(["uak1"], []), 1, "umm_al_kitab")!;
    expect(uak.modules[0].done).toBe(true);
    expect(uak.doneCount).toBe(1);
    expect(uak.moduleCount).toBe(2);
  });

  it("rolls counts up to the term", () => {
    const [t1] = progress(["taj1", "uak1", "uak2"], [["h1", "approved"]]);
    expect(t1.doneCount).toBe(3);   // taj w1 + uak w1 + uak w2
    expect(t1.moduleCount).toBe(5); // tajweed 3 + uak 2
  });

  it("points nextModule at the first unlocked module still outstanding", () => {
    const taj = findCourse(progress(["taj1"], [["h1", "approved"]]), 1, "tajweed")!;
    expect(taj.nextModule?.weekNumber).toBe(2);
  });

  it("has no next module when a course is finished", () => {
    const done = progress(["uak1", "uak2"], []);
    expect(findCourse(done, 1, "umm_al_kitab")!.nextModule).toBeNull();
  });

  it("never points nextModule at a locked module", () => {
    const t2taj = findCourse(progress([], []), 2, "tajweed")!;
    expect(t2taj.nextModule).toBeNull();
  });
});

describe("findCurrentModule", () => {
  it("resolves the live week to a course and module", () => {
    const found = findCurrentModule(tree());
    expect(found).toMatchObject({ termId: 1, series: "tajweed" });
    expect(found!.module.weekNumber).toBe(3);
  });

  it("returns null before the year starts", () => {
    const early = buildTree({ terms, weeks, lessons, homeworks }, new Date(Date.UTC(2026, 0, 1)));
    expect(findCurrentModule(early)).toBeNull();
  });
});

describe("listHomework / bucketHomework — the worklist", () => {
  const listed = (watched: string[], subs: [string, string][]) =>
    listHomework(
      overlayProgress(tree(), {
        watchedLessonIds: new Set(watched),
        submissionByHomeworkId: new Map(subs as [string, never][]),
      }),
    );

  it("carries the course context every row needs", () => {
    const first = listed([], [])[0];
    expect(first).toMatchObject({
      termId: 1,
      series: "tajweed",
      courseLabel: "Tajweed",
      weekNumber: 1,
    });
    expect(first.homework.number).toBe(1);
  });

  it("lists every homework in the year, in teaching order", () => {
    expect(listed([], []).map((e) => e.homework.number))
      .toEqual([1, 2, 3, 4, 5, 6, 101, 102]);
  });

  it("splits into needs-you, with-teacher and marked", () => {
    const b = bucketHomework(listed([], [
      ["h1", "approved"],
      ["h2", "submitted"],
      ["h3", "draft"],
    ]));
    expect(b.marked.map((e) => e.homework.number)).toEqual([1]);
    expect(b.withTeacher.map((e) => e.homework.number)).toEqual([2]);
    expect(b.needsYou.map((e) => e.homework.number)).toEqual([3]);
  });

  it("treats auto_marked as with-teacher — students never see it early", () => {
    const b = bucketHomework(listed([], [["h1", "auto_marked"]]));
    expect(b.withTeacher.map((e) => e.homework.number)).toEqual([1]);
    expect(b.marked).toEqual([]);
  });

  it("puts untouched released homework in needs-you", () => {
    const b = bucketHomework(listed([], []));
    // T1 weeks 1–3 are unlocked; everything later is not
    expect(b.needsYou.map((e) => e.homework.number)).toEqual([1, 2, 3]);
  });

  it("never asks a student for work that has not been released", () => {
    const b = bucketHomework(listed([], []));
    expect(b.needsYou.every((e) => e.unlocked)).toBe(true);
    expect(b.upcoming.map((e) => e.homework.number)).toEqual([4, 5, 6, 101, 102]);
  });

  it("shows newest marked work first", () => {
    const b = bucketHomework(listed([], [["h1", "approved"], ["h3", "approved"]]));
    expect(b.marked.map((e) => e.homework.number)).toEqual([3, 1]);
  });
});

/* Home asks "what is on this week?" across every course at once — a question
 * the term/series tree is the wrong shape for. */

describe("weekContent — one week, every course", () => {
  const rows = { lessons, homeworks };

  it("returns the week's lessons from every series, ordered by position", () => {
    const w = weekContent(rows, "t1w1");
    // two courses run that week: Tajweed at position 1, Umm al-Kitab at 2
    expect(w.lessons.map((l) => l.id)).toEqual(["taj1", "uak1"]);
    expect(w.lessons.map((l) => l.series)).toEqual(["tajweed", "umm_al_kitab"]);
    expect(w.homeworks.map((h) => h.id)).toEqual(["h1"]);
  });

  /* Term 3 week 1 really does carry two homeworks — Tajweed 16 and TFP 1.
   * Returning one row would silently hide half a student's week. */
  it("carries every homework the week holds, not just one", () => {
    const w = weekContent(rows, "t3w1");
    expect(w.homeworks.map((h) => h.number)).toEqual([6, 101]);
    expect(w.homeworks.map((h) => h.series)).toEqual(["tajweed", "tfp"]);
    expect(w.lessons.map((l) => l.id)).toEqual(["taj6", "tfp1"]);
  });

  it("sorts rather than trusting the order it was handed", () => {
    const w = weekContent(
      { lessons: [...lessons].reverse(), homeworks: [...homeworks].reverse() },
      "t3w1",
    );
    expect(w.lessons.map((l) => l.id)).toEqual(["taj6", "tfp1"]);
    expect(w.homeworks.map((h) => h.number)).toEqual([6, 101]);
  });

  it("returns empty lists for a week with nothing on it", () => {
    expect(weekContent({ lessons: [], homeworks: [] }, "t1w1"))
      .toEqual({ lessons: [], homeworks: [] });
    // a week id nothing points at behaves the same way, not a crash
    expect(weekContent(rows, "t9w9")).toEqual({ lessons: [], homeworks: [] });
  });

  it("leaves the rows it was given untouched", () => {
    const before = lessons.map((l) => l.id);
    weekContent(rows, "t1w1");
    expect(lessons.map((l) => l.id)).toEqual(before);
  });
});

describe("edge cases", () => {
  it("survives an empty curriculum", () => {
    const empty = buildTree({ terms, weeks: [], lessons: [], homeworks: [] }, NOW);
    expect(empty.map((t) => t.courses)).toEqual([[], [], []]);
    expect(empty[0].moduleCount).toBe(0);
    expect(findCurrentModule(empty)).toBeNull();
  });

  it("ignores rows pointing at weeks that do not exist", () => {
    const orphan = buildTree(
      { terms, weeks, lessons: [...lessons, lesson("ghost", "nope", "tajweed", "Orphan")], homeworks },
      NOW,
    );
    expect(findCourse(orphan, 1, "tajweed")!.modules.length).toBe(3);
  });

  it("falls back to the raw series key for an unknown series", () => {
    const odd = buildTree(
      { terms, weeks, lessons: [lesson("x", "t1w1", "mystery", "?")], homeworks: [] },
      NOW,
    );
    expect(odd[0].courses[0].label).toBe("mystery");
  });
});
