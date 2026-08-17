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
import { getCachedTerms, getCachedWeeks } from "@/lib/reference/cached";
import { seriesBlurb, seriesLabel, seriesRank, SERIES_ORDER } from "@/lib/lessons/series";
import type { TermRow, WeekRow } from "./tree";

/** Structure only — the shape of the year, never its contents. The video id is
 *  the one exception, and only so a block has a poster frame; it is used ONLY
 *  for blocks the reader can already open (see CourseTile), never for a locked
 *  one, so nothing behind a lock is rendered. */
export type CatalogueRow = { week_id: string; series: string; youtube_id?: string | null };

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
      blurb: "Nūn sākin, tanwīn and meem sākin — iẓhār, idghām, iqlāb, ikhfā’.",
      slug: "tajweed-noon-meem-sakin",
    },
    2: {
      label: "Ṣifāt al-Ḥurūf",
      blurb: "The qualities of the letters: the heavy letters, Lām, Rā, qalqala, hams.",
      slug: "tajweed-sifaat",
    },
    3: {
      label: "Mudūd",
      blurb: "The lengthenings — muttaṣil, munfaṣil, ʿāriḍ, lāzim — and stopping.",
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
  moduleCount: number;
  hasHomework: boolean;
  /** First lesson video in the block — the cover art until real art exists. */
  posterId: string | null;
  opensAt: string | null;
  started: boolean;
  fullyOpen: boolean;
};

/**
 * The courses a class studies, or null for "everything in the calendar".
 *
 * The programme intends this to differ by class — a beginner class does not do
 * the Ten Fundamental Principles — but nothing in the schema says so yet:
 * `series` hangs off lessons and homeworks, which hang off programme-wide
 * weeks. So today every class studies whatever the calendar holds.
 *
 * This is the ONE place that changes when per-class curricula arrive. Give it a
 * `class_series` table (class_id, series) and return that class's rows; both
 * halves of the index follow without another edit.
 */
export function coursesForClass(_classId: string | null): string[] | null {
  return null;
}

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
): CourseBlock[] {
  const nowMs = now.getTime();
  const weekById = new Map(weeks.map((w) => [w.id, w]));

  type Acc = {
    weekIds: Set<string>;
    hasHomework: boolean;
    posterId: string | null;
    posterWeek?: number;
  };
  const byBlock = new Map<string, Acc>();
  const seriesSeen = new Set<string>();
  const accFor = (series: string, termId: number): Acc => {
    seriesSeen.add(series);
    const k = `${series} ${termId}`;
    let acc = byBlock.get(k);
    if (!acc) byBlock.set(k, (acc = { weekIds: new Set(), hasHomework: false, posterId: null }));
    return acc;
  };

  for (const row of lessons) {
    const week = weekById.get(row.week_id);
    if (!week) continue; // orphan — its week was deleted
    const acc = accFor(row.series, week.term_id);
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

export type SplitCourses = {
  /** Open now, or open and finished — what they are actually studying. */
  mine: CourseBlock[];
  /** Everything else, and why it is shut. */
  locked: { block: CourseBlock; reason: "later" | "not-running" }[];
};

/**
 * Split the catalogue into what a student can open and what they cannot.
 *
 * Three states, and the difference between the last two is worth drawing: a
 * block that opens in Term 3 is coming to them, while a course their class is
 * not on may never. Both are locked; only one has a date.
 */
export function splitCourses(
  catalogue: CourseBlock[],
  studying: string[] | null,
): SplitCourses {
  const mine: CourseBlock[] = [];
  const locked: SplitCourses["locked"] = [];

  for (const block of catalogue) {
    const onTheirTimetable =
      studying === null ? block.moduleCount > 0 : studying.includes(block.series);
    if (!onTheirTimetable || block.moduleCount === 0) {
      locked.push({ block, reason: "not-running" });
    } else if (block.started) {
      mine.push(block);
    } else {
      locked.push({ block, reason: "later" });
    }
  }
  return { mine, locked };
}

/* ── IO ───────────────────────────────────────────────────────────────── */

export async function getCatalogue(now: Date = new Date()): Promise<{
  terms: TermRow[];
  blocks: CourseBlock[];
}> {
  const db = supabaseAdmin();
  const [terms, weeks, lessons, homeworks] = await Promise.all([
    getCachedTerms(),
    getCachedWeeks(),
    db.from("lessons").select("week_id, series, youtube_id"),
    db.from("homeworks").select("week_id, series"),
  ]);

  return {
    terms: terms as TermRow[],
    blocks: buildCatalogue(
      weeks as WeekRow[],
      (lessons.data ?? []) as CatalogueRow[],
      (homeworks.data ?? []) as CatalogueRow[],
      now,
    ),
  };
}
