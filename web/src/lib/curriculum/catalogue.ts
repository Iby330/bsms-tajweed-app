/**
 * The course catalogue — the whole programme as a grid of topic blocks.
 *
 * A tile is a (series, term) pair, not a series. "Tajweed" as one box is a box
 * with twenty-one modules in it and no promise about what they cover; the year
 * actually teaches three distinct topics under that name, and the titles say so
 * plainly: Term 1 is Noon Sākin, Tanwīn and Meem Sākin, Term 2 is the ṣifāt
 * (the heavy letters, Lām, Rā, Qalqala, Hams), Term 3 is the mudūd. Those are
 * what a student thinks they are studying, so those are the boxes. Courses that
 * only run for one term — Umm al-Kitāb, TFP — come out as a single block each,
 * which is the same rule with nothing to split.
 *
 * Two things the student curriculum read cannot answer, and this can:
 *
 *   1. Blocks the student CANNOT open. `s_lessons_unlocked` and
 *      `s_homeworks_unlocked` remove locked rows from a student's session
 *      entirely, so a student in Term 1 has no way of knowing the mudūd exist
 *      in Term 3 — the rows are invisible, not flagged.
 *   2. Named courses with no content at all this year, which is the breadth the
 *      locked section is for.
 *
 * So the catalogue is read with the service-role client, like the rest of the
 * reference data, and selects STRUCTURE ONLY: series, week, whether homework
 * exists. No titles, no video ids, nothing a locked week contains. A student
 * learns that six modules of mudūd open in July; they do not learn what is in
 * them. That keeps the promise the RLS policies were written to make while
 * still answering "how much more is there", which is the point of the section.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getCachedTerms, getCachedWeeks, getCachedSectionWeeks } from "@/lib/reference/cached";
import { weeksForSection } from "./section-weeks";
import { seriesBlurb, seriesLabel, seriesRank, SERIES_COMING_SOON, SERIES_ORDER } from "@/lib/lessons/series";
import { COURSES, SYLLABUS } from "./syllabus";
import type { Course, Term, TermRow, WeekRow } from "./tree";

/** Structure only — the shape of the year, never its contents. The video id is
 *  the one exception, and only so a block has a poster frame; it is used ONLY
 *  for blocks the reader can already open (see CourseTile), never for a locked
 *  one, so nothing behind a lock is rendered. */
export type CatalogueRow = {
  week_id: string;
  series: string;
  /** Which course this row belongs to (migration 0026). The join between the
   *  catalogue and the student's tree — see `CourseBlock.courseKey`. */
  course_id?: string | null;
  youtube_id?: string | null;
};

/**
 * What each term of a series is actually about.
 *
 * Hand-written, and it has to be: the topic of a term is a teaching decision,
 * and the only machine-readable trace of it is a scatter of homework titles
 * ("Iqlaab", "The Heaviness of Ra", "Madd Lazim") that name individual rules
 * rather than the block they belong to. Anything missing here falls back to
 * "<Course> · Term N", which is correct but says less.
 *
 * `slug` is the cover image filename, so it must stay stable once art exists.
 */
const TOPICS: Record<string, Record<number, { label: string; blurb: string; slug: string }>> = {
  tajweed: {
    1: {
      label: "Noon & Meem Sākin",
      blurb: "Nūn sākin, tanwīn and meem sākin: iẓhār, idghām, iqlāb, ikhfā’.",
      slug: "tajweed-noon-meem-sakin",
    },
    2: {
      label: "Ṣifāt al-Ḥurūf",
      blurb: "The qualities of the letters: the heavy letters, Lām, Rā, qalqala, hams.",
      slug: "tajweed-sifaat",
    },
    3: {
      label: "Mudūd",
      blurb: "The lengthenings (muttaṣil, munfaṣil, ʿāriḍ, lāzim) and stopping.",
      slug: "tajweed-mudood",
    },
  },
  umm_al_kitab: {
    1: {
      label: "Umm al-Kitāb",
      blurb: "Surah Al-Fātiha, verse by verse.",
      slug: "umm-al-kitab",
    },
  },
  tfp: {
    3: {
      label: "Ten Fundamental Principles",
      blurb: "The ten principles every science rests on.",
      slug: "tfp",
    },
  },
  qaidah: {
    1: {
      label: "Qāʿidah Nūrāniyyah",
      blurb: "The Arabic letters: how each one is said, and how to tell them apart.",
      slug: "qaidah",
    },
  },
};

/** One topic block: a series within a term, or a course not running at all. */
export type CourseBlock = {
  series: string;
  /** Null for a course with no content this year — it belongs to no term. */
  termId: number | null;
  /** The topic name, e.g. "Mudūd". */
  label: string;
  /** The course it sits under, e.g. "Tajweed". Null when they are the same. */
  parentLabel: string | null;
  blurb: string;
  /** Cover image basename, without extension. */
  slug: string;
  /**
   * The course whose rows make up this block, or null for a block that
   * predates 0026's backfill or holds no rows at all.
   *
   * A block is still keyed by (series, term) — by WHERE THE ROWS LIVE — while
   * a student's tree keys a course by the course itself, because a class can
   * take the same course in a different term. This is the one field that lets
   * the two be matched up, and without it the index links a student at a
   * course their tree has never heard of.
   */
  courseKey: string | null;
  moduleCount: number;
  hasHomework: boolean;
  /** First lesson video in the block — the cover art until real art exists. */
  posterId: string | null;
  opensAt: string | null;
  started: boolean;
  fullyOpen: boolean;
};

/**
 * What to call one (series, term) block — no IO, so a page that already knows
 * which block it is on can name it without reading the whole catalogue back.
 */
export function blockTopic(series: string, termId: number) {
  return topicFor(series, termId);
}

function topicFor(series: string, termId: number) {
  const named = TOPICS[series]?.[termId];
  const courseLabel = seriesLabel(series);
  if (named) {
    return {
      label: named.label,
      parentLabel: named.label === courseLabel ? null : courseLabel,
      blurb: named.blurb,
      slug: named.slug,
    };
  }
  return {
    label: `${courseLabel} · Term ${termId}`,
    parentLabel: null,
    blurb: seriesBlurb(series),
    slug: `${series}-t${termId}`,
  };
}

/* ── Pure ─────────────────────────────────────────────────────────────── */

/**
 * Fold the flat rows into one block per (series, term), plus a block for every
 * named series the calendar holds nothing for — that absence is the breadth,
 * and on the index it reads as "we teach this, just not to you this year".
 */
export function buildCatalogue(
  weeks: WeekRow[],
  lessons: CatalogueRow[],
  homeworks: CatalogueRow[],
  now: Date = new Date(),
  /** course id → key, from the `courses` table. Omit and blocks carry no
   *  course key, which costs the index its link to the student's tree. */
  courseKeyById: Map<string, string> = new Map(),
): CourseBlock[] {
  const nowMs = now.getTime();
  const weekById = new Map(weeks.map((w) => [w.id, w]));

  type Acc = {
    weekIds: Set<string>;
    hasHomework: boolean;
    posterId: string | null;
    posterWeek?: number;
    courseKey: string | null;
  };
  const byBlock = new Map<string, Acc>();
  const seriesSeen = new Set<string>();
  const accFor = (series: string, termId: number): Acc => {
    seriesSeen.add(series);
    const k = `${series} ${termId}`;
    let acc = byBlock.get(k);
    if (!acc) {
      byBlock.set(k, (acc = {
        weekIds: new Set(), hasHomework: false, posterId: null, courseKey: null,
      }));
    }
    return acc;
  };
  // 0026 verified that every (series, term) pair in the data holds precisely
  // one course, so the first row to name one names the block.
  const noteCourse = (acc: Acc, courseId: string | null | undefined) => {
    if (acc.courseKey === null && courseId) acc.courseKey = courseKeyById.get(courseId) ?? null;
  };

  for (const row of lessons) {
    const week = weekById.get(row.week_id);
    if (!week) continue; // orphan — its week was deleted
    const acc = accFor(row.series, week.term_id);
    noteCourse(acc, row.course_id);
    acc.weekIds.add(row.week_id);
    // The earliest week's video, so the cover is the opening lesson rather than
    // whichever row the database happened to return first.
    if (row.youtube_id && (acc.posterId === null || week.number < (acc.posterWeek ?? 99))) {
      acc.posterId = row.youtube_id;
      acc.posterWeek = week.number;
    }
  }
  for (const row of homeworks) {
    const week = weekById.get(row.week_id);
    if (!week) continue;
    const acc = accFor(row.series, week.term_id);
    noteCourse(acc, row.course_id);
    acc.weekIds.add(row.week_id);
    acc.hasHomework = true;
  }

  const blocks: CourseBlock[] = [...byBlock.entries()].map(([k, acc]) => {
    const [series, termPart] = k.split(" ");
    const termId = Number(termPart);
    const unlockTimes = [...acc.weekIds]
      .map((id) => Date.parse(weekById.get(id)!.unlock_at))
      .sort((a, b) => a - b);
    return {
      series,
      termId,
      ...topicFor(series, termId),
      courseKey: acc.courseKey,
      moduleCount: acc.weekIds.size,
      hasHomework: acc.hasHomework,
      posterId: acc.posterId,
      opensAt: new Date(unlockTimes[0]).toISOString(),
      started: unlockTimes[0] <= nowMs,
      fullyOpen: unlockTimes[unlockTimes.length - 1] <= nowMs,
    } satisfies CourseBlock;
  });

  // Courses the programme teaches but is not running at all this year.
  for (const series of SERIES_ORDER) {
    if (seriesSeen.has(series)) continue;
    blocks.push({
      series,
      termId: null,
      label: seriesLabel(series),
      parentLabel: null,
      blurb: seriesBlurb(series),
      slug: series,
      courseKey: null,
      moduleCount: 0,
      hasHomework: false,
      posterId: null,
      opensAt: null,
      started: false,
      fullyOpen: false,
    });
  }

  return blocks.sort(
    (a, b) =>
      (a.termId ?? 99) - (b.termId ?? 99) ||
      seriesRank(a.series) - seriesRank(b.series) ||
      a.label.localeCompare(b.label),
  );
}

/** One square on the course index: what to draw, and where it goes. */
export type IndexTile = {
  /** Stable React key. */
  id: string;
  block: CourseBlock;
  /** Null renders the square locked and unclickable. */
  href: string | null;
  /**
   * Why it is shut. Only read when href is null.
   *
   * `no-content` is the third state and it is not a nicety: Masjid Al-Aqsa's
   * whole of Term 1 is Qāʿidah Nūrāniyyah, which the app holds nothing for.
   * Filed as `not-running` it reads "Not taught this year" — to the four
   * students being taught it every week.
   */
  reason?: "later" | "not-running" | "no-content" | "elsewhere" | "coming-soon";
  /** Modules done / modules with something in them. Open tiles only. */
  progress?: { done: number; total: number };
};

export type CourseIndex = {
  /** Open now — what they are actually studying. */
  mine: IndexTile[];
  /** Everything else, and why it is shut. */
  locked: IndexTile[];
};

/**
 * Split the programme into what this student can open and what they cannot.
 *
 * ── Why this needs BOTH the tree and the catalogue ───────────────────────
 *
 * The tree is read as the student, so it is the only thing that knows which
 * courses are theirs, which term THEY take each one in, and how far through
 * it they are. What it cannot know is the shape of a course it has not been
 * given: post-0027 RLS withholds every row that has not opened for their
 * class, so a course they start in March arrives as an empty shell. The
 * catalogue is read with the service role and knows that shell holds six
 * modules. Neither half can draw this page alone.
 *
 * ── The join, and the bug it fixes ───────────────────────────────────────
 *
 * A catalogue block is keyed by where the ROWS live — (series, term) — and a
 * tree course by the course itself, because group 1 takes Mudūd in Term 1 off
 * rows filed under Term 3. Keying the tiles off the catalogue therefore sent
 * every student in a levelled class to `/courses/1/tajweed`, a term-and-series
 * pair their tree has never heard of, and `findCourse` returned null: a 404 on
 * every tile, for all five classes with a syllabus, from the day Term 1 opened.
 * So the tiles are built from the TREE and borrow the catalogue's cover art,
 * blurb and true module count by matching on `courseKey`.
 */
export function courseIndex(
  catalogue: CourseBlock[],
  terms: Term[],
  /** Whether the tree was built from a class syllabus. It decides what an
   *  unmatched block means: with a syllabus it is somebody else's course,
   *  without one it is simply the student's own next term. */
  hasSyllabus: boolean,
): CourseIndex {
  const mine: IndexTile[] = [];
  const locked: IndexTile[] = [];
  const claimed = new Set<CourseBlock>();

  for (const term of terms) {
    for (const course of term.courses) {
      // By course first — that is the syllabus-proof identity — and by
      // (series, term) for a tree built without one. Course keys and series
      // names are disjoint, so the two can never match the wrong block.
      const byKey = catalogue.find((b) => b.courseKey !== null && b.courseKey === course.series);
      const src = byKey
        ?? catalogue.find((b) => b.series === course.series && b.termId === term.id);
      if (src) claimed.add(src);

      const block = tileBlock(course, term.id, src, byKey !== undefined);
      const id = `${term.id} ${course.series}`;

      if (block.moduleCount === 0) {
        // On their tree, so it IS theirs — there is simply nothing in it yet.
        locked.push({ id, block, href: null, reason: "no-content" });
      } else if (course.unlockedCount > 0) {
        mine.push({
          id, block,
          href: `/courses/${term.id}/${course.series}`,
          progress: { done: course.doneCount, total: course.actionableCount },
        });
      } else {
        locked.push({ id, block, href: null, reason: "later" });
      }
    }
  }

  // Whatever the tree never mentioned. For a class with a syllabus that is
  // another class's course; for one without, it is the rest of their own year.
  for (const block of catalogue) {
    if (claimed.has(block)) continue;
    const later = !hasSyllabus && block.moduleCount > 0 && !block.started;
    locked.push({
      id: `${block.series} ${block.termId}`,
      block,
      href: null,
      reason: later ? "later" : "not-running",
    });
  }

  return { mine, locked };
}

/**
 * The student's course, dressed in the catalogue's art.
 *
 * `moduleCount` takes the larger of the two on purpose: the tree counts what
 * RLS handed over, the catalogue counts what exists, and "6 modules" is the
 * honest shape of a course whether or not this reader has been given all six.
 */
function tileBlock(
  course: Course, termId: number, src: CourseBlock | undefined, byKey: boolean,
): CourseBlock {
  const open = course.unlockedCount > 0;
  const moduleCount = Math.max(course.moduleCount, src?.moduleCount ?? 0);
  // The cover: the first video the reader has been handed, else the
  // catalogue's poster. A course still ahead keeps its poster too: a
  // thumbnail gives nothing of the course away.
  const poster =
    (open ? course.modules.flatMap((m) => m.lessons).find((l) => l.youtube_id)?.youtube_id : null)
    ?? src?.posterId ?? null;

  return {
    series: course.series,
    termId,
    // Under a syllabus the course carries the name the teacher gives it
    // ("Ghunna"); without one the catalogue's topic name is the better label,
    // since the tree can only offer the bare series ("Tajweed").
    label: byKey ? course.label : (src?.label ?? course.label),
    parentLabel: byKey ? null : (src?.parentLabel ?? null),
    blurb: course.blurb || src?.blurb || "",
    slug: src?.slug ?? course.series,
    courseKey: src?.courseKey ?? null,
    moduleCount,
    hasHomework: course.hasHomework || (src?.hasHomework ?? false),
    posterId: poster,
    opensAt: course.opensAt ?? src?.opensAt ?? null,
    started: open,
    fullyOpen: open && course.unlockedCount >= moduleCount,
  };
}

/** A course named on a term tile: a link only when something in it is open. */
export type TermCourse = { key: string; label: string; href: string | null };

/** One term of the reader's year, as the Courses page shows it. */
export type TermTile = {
  id: number;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
  /** Something in the term has opened for this reader. */
  open: boolean;
  /** The term page; an open term only. */
  href: string | null;
  /** When it opens for this reader; a term not yet open only. */
  opensAt: string | null;
  courses: TermCourse[];
  /** Up to two video ids for the tile's cover, one per course that has one. */
  posters: string[];
  /** Modules done / modules with something in them; an open term only. */
  progress: { done: number; total: number } | null;
};

export type TermIndex = { terms: TermTile[]; rest: IndexTile[] };

/**
 * The year by term, and the programme beyond the reader's plan.
 *
 * Built on courseIndex, which already joins the tree to the catalogue and
 * decides which course is openable: a course is linked here exactly when it
 * is an open tile there.
 *
 * ── Open vs. linkable ─────────────────────────────────────────────────────
 *
 * Those are not the same question. A term is OPEN the moment it has begun for
 * this reader — at least one of its weeks has unlocked — whether or not any
 * course in it currently has something to click: Al-Aqsa's Term 1 is running,
 * but its one course, Qāʿidah, has no content at all, so nothing in it is
 * LINKABLE. Reading that as locked would print "Opens Sat 3 Oct" under a term
 * that started weeks ago. So `open` is "has begun OR something is linkable",
 * while `href` (the heading's own link) stays tied to linkable alone — a term
 * with nothing to click gets no padlock and no link either, just its name and
 * courses as plain text. `opensAt` and `progress` only mean anything for a
 * term that has not begun / has begun respectively, so each reads null on the
 * wrong side of `open`.
 *
 * A term not yet open is dated by its earliest course, or, with no course
 * planned, by its first week on the reader's calendar.
 */
export function termIndex(
  catalogue: CourseBlock[],
  terms: Term[],
  hasSyllabus: boolean,
): TermIndex {
  const { mine, locked } = courseIndex(catalogue, terms, hasSyllabus);
  const tileById = new Map([...mine, ...locked].map((t) => [t.id, t]));
  const earliest = (dates: string[]) =>
    [...dates].sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;

  const tiles = terms.map((term): TermTile => {
    const courses = term.courses.map((course) => {
      const tile = tileById.get(`${term.id} ${course.series}`);
      return { key: course.series, label: tile?.block.label ?? course.label, href: tile?.href ?? null };
    });
    // The cover: the first video of each course, as far as two. What the
    // student has been handed comes first; for a course still ahead, the
    // catalogue's poster, since a thumbnail gives nothing of the course away.
    const posters = [...new Set(term.courses.flatMap((course) => {
      const seen = course.modules.flatMap((m) => m.lessons).find((l) => l.youtube_id)?.youtube_id;
      const poster = seen
        ?? catalogue.find((b) => b.courseKey !== null && b.courseKey === course.series)?.posterId
        ?? catalogue.find((b) => b.series === course.series && b.termId === term.id)?.posterId;
      return poster ? [poster] : [];
    }))].slice(0, 2);
    const linkable = courses.some((c) => c.href !== null);
    // Begun: some week of the term has unlocked for this reader, regardless
    // of whether what it unlocked is anything a course can link to.
    const begun = term.weekCount > term.lockedWeeks.length;
    const open = linkable || begun;
    const opensAt = open
      ? null
      : earliest(term.courses.flatMap((c) => (c.opensAt ? [c.opensAt] : [])))
        ?? earliest(term.lockedWeeks.map((w) => w.unlockAt));
    return {
      id: term.id,
      startsOn: term.startsOn,
      endsOn: term.endsOn,
      isCurrent: term.isCurrent,
      open,
      href: linkable ? `/courses/${term.id}` : null,
      opensAt,
      courses,
      posters,
      progress: open && term.actionableCount > 0
        ? { done: term.doneCount, total: term.actionableCount }
        : null,
    };
  });

  // Without a syllabus the tree is the whole programme: nothing left over is
  // someone else's, so there is no "rest" to show.
  //
  // With one, "rest" is COURSE-based, not block-based, because a course with
  // no content yet (Makhārij, the new Ṣifāt, Qāʿidah) has no catalogue block
  // at all to find — there are no rows for `buildCatalogue` to fold it from.
  // So the source of truth here is `COURSES`, the syllabus's own list of
  // every named course, not the catalogue: for each one this reader's plan
  // never mentions, make a tile — borrowing the catalogue's art and shape
  // when a block exists for it, synthesizing a bare one when it doesn't —
  // labelled with the COURSE's own name (not the topic name a shared block
  // might carry, which is what a student actually takes it under).
  //
  // One thing COURSES cannot name: a series with rows but no course row at
  // all (pre-0026, or simply never backfilled — Seerah today). Those still
  // show up as catalogue blocks with `courseKey: null`, and are appended
  // after the course-based tiles so they are not lost.
  let rest: IndexTile[] = [];
  if (hasSyllabus) {
    const planned = new Set(terms.flatMap((t) => t.courses.map((c) => c.series)));
    // A course's block, by its key, else by where COURSES says its lessons
    // live, for a block whose rows were never tied to a course. Either way the
    // block is spoken for, so it is not shown again as a series of its own,
    // nor, for a course this class takes, as someone else's.
    const used = new Set<CourseBlock>();
    const blockOf = (key: string, def: (typeof COURSES)[keyof typeof COURSES]) => {
      const src = catalogue.find((b) => b.courseKey === key)
        ?? (def.source
          ? catalogue.find((b) => b.courseKey === null
              && b.series === def.source!.series && b.termId === def.source!.termId)
          : undefined)
        // A course whose series shares its name (Qāʿidah) owns that series'
        // empty block too, from before any of its rows exist; left unclaimed
        // it would be a second "Qāʿidah" tile beside the course's own.
        ?? catalogue.find((b) => b.courseKey === null && b.series === key && b.termId === null);
      if (src) used.add(src);
      return src;
    };
    for (const [key, def] of Object.entries(COURSES)) if (planned.has(key)) blockOf(key, def);
    const taughtSomewhere = new Set<string>(
      Object.values(SYLLABUS).flatMap((byTerm) => Object.values(byTerm).flat()),
    );
    const courseTiles: IndexTile[] = Object.entries(COURSES)
      .filter(([key]) => !planned.has(key))
      .map(([key, def]) => {
        const src = blockOf(key, def);
        const block: CourseBlock = src
          ? { ...src, label: def.label, parentLabel: null }
          : {
              series: key, termId: null, label: def.label, parentLabel: null, blurb: "",
              slug: key, courseKey: key, moduleCount: 0, hasHomework: false, posterId: null,
              opensAt: null, started: false, fullyOpen: false,
            };
        // Another class's plan names it, so it is running this year even
        // with nothing in the app yet (the new Ṣifāt, Makhārij).
        const reason = taughtSomewhere.has(key) ? "elsewhere" as const : "not-running" as const;
        return { id: `rest ${key}`, block, href: null, reason };
      });
    const seriesTiles = locked
      .filter((t) => t.reason === "not-running" && t.block.courseKey === null && !used.has(t.block))
      .map((t) => SERIES_COMING_SOON.has(t.block.series) ? { ...t, reason: "coming-soon" as const } : t);
    rest = [...courseTiles, ...seriesTiles];
  }
  return { terms: tiles, rest };
}

/* ── IO ───────────────────────────────────────────────────────────────── */

export async function getCatalogue(
  now: Date = new Date(),
  /** Whose calendar `opensAt`/`started` follow (0052); none is the shared weeks. */
  section: string | null = null,
): Promise<{
  terms: TermRow[];
  blocks: CourseBlock[];
}> {
  const db = supabaseAdmin();
  const [terms, weeks, sectionWeeks, lessons, homeworks, courses] = await Promise.all([
    getCachedTerms(),
    getCachedWeeks(),
    getCachedSectionWeeks(),
    db.from("lessons").select("week_id, series, course_id, youtube_id"),
    db.from("homeworks").select("week_id, series, course_id"),
    db.from("courses").select("id, key"),
  ]);

  return {
    terms: terms as TermRow[],
    blocks: buildCatalogue(
      weeksForSection(weeks as WeekRow[], sectionWeeks, section),
      (lessons.data ?? []) as CatalogueRow[],
      (homeworks.data ?? []) as CatalogueRow[],
      now,
      new Map((courses.data ?? []).map((c) => [c.id, c.key])),
    ),
  };
}
