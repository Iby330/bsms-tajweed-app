/**
 * Class results for one homework — pure aggregation, no IO.
 *
 * The results view asks three questions of the same answer rows: how did the
 * class do (spread + histogram), which questions went badly (questionStats),
 * and what did they actually put (tallyOptions). All of it is arithmetic, so it
 * lives here and is tested without a database.
 *
 * Two rules run through the lot:
 *
 *   · A mark is `final_marks ?? auto_marks`. The teacher's number once they
 *     have entered one, the machine's until then. Counting approved work only
 *     would leave the summary empty during the very session a teacher is
 *     marking in, which is when they most want to see the shape of the class.
 *     The caller says how many of the rows are still provisional.
 *
 *   · Bonus questions never count towards a total, exactly as `v_hw_pct_all`
 *     excludes them — so a percentage here is the same percentage the student
 *     sees on their own screen, and the two can be quoted in the same sentence.
 */

import { responseIsEmpty, selectedOf } from "@/lib/homework/logic";
import type { QuestionOption } from "@/lib/marking/objective";

export type ScoreAnswer = {
  submission_id: string;
  question_id: string;
  response?: unknown;
  auto_marks: number | null;
  final_marks: number | null;
};

export type ScoreSubmission = {
  id: string;
  student_id: string;
  status: string;
  /** Last year's spreadsheet total, for submissions that carry no answers. */
  imported_marks?: number | null;
};

export type ScoredSubmission = {
  submissionId: string;
  studentId: string;
  /** Released to the student. Anything else is a provisional mark. */
  approved: boolean;
  marks: number;
  pct: number;
};

const markOf = (a: { auto_marks: number | null; final_marks: number | null }) =>
  a.final_marks ?? a.auto_marks;

/**
 * A mark per submission, for every submission that has one.
 *
 * Submissions with no marked answer and no imported total are dropped rather
 * than scored zero: "handed in, not yet marked" is not a zero, and averaging it
 * as one would libel the whole class the moment a teacher opened the page.
 */
export function scoreSubmissions(
  subs: ScoreSubmission[],
  answers: ScoreAnswer[],
  questions: { id: string; is_bonus: boolean }[],
  totalMarks: number,
): ScoredSubmission[] {
  const counts = new Set(questions.filter((q) => !q.is_bonus).map((q) => q.id));
  const bySub = new Map<string, ScoreAnswer[]>();
  for (const a of answers) {
    const list = bySub.get(a.submission_id) ?? [];
    list.push(a);
    bySub.set(a.submission_id, list);
  }

  const out: ScoredSubmission[] = [];
  for (const s of subs) {
    const rows = bySub.get(s.id) ?? [];
    let marks: number | null = null;

    if (rows.some((a) => markOf(a) !== null)) {
      // An answer to a question that has since been deleted keeps its row but
      // no longer belongs to the total — same rule the marking screen uses.
      marks = rows.reduce(
        (sum, a) => (counts.has(a.question_id) ? sum + Number(markOf(a) ?? 0) : sum),
        0,
      );
    } else if (s.imported_marks !== null && s.imported_marks !== undefined) {
      marks = Number(s.imported_marks);
    }
    if (marks === null) continue;

    out.push({
      submissionId: s.id,
      studentId: s.student_id,
      approved: s.status === "approved",
      marks,
      pct: totalMarks > 0 ? (marks / totalMarks) * 100 : 0,
    });
  }
  return out;
}

export type Spread = {
  count: number;
  mean: number;
  median: number;
  min: number;
  max: number;
};

/** Null for an empty set — there is no average of nothing, and 0 would read
 *  as a class that scored nothing. */
export function spread(values: number[]): Spread | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return {
    count: sorted.length,
    mean: sorted.reduce((s, n) => s + n, 0) / sorted.length,
    median:
      sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

export type Band = { from: number; to: number; count: number };

/**
 * Percentages bucketed into bands across 0–100.
 *
 * 20-point bands by default: at a class of twenty, ten bars are mostly empty
 * and the distribution stops being readable as a shape. 100% lands in the top
 * band rather than a band of its own, and anything a stray mark pushes past
 * 100 is clamped there too.
 */
export function histogram(values: number[], band = 20): Band[] {
  const bands: Band[] = [];
  for (let from = 0; from < 100; from += band) {
    bands.push({ from, to: Math.min(from + band, 100), count: 0 });
  }
  if (bands.length === 0) return bands;

  for (const v of values) {
    const clamped = Math.min(Math.max(v, 0), 100);
    const i = Math.min(Math.floor(clamped / band), bands.length - 1);
    bands[i].count++;
  }
  return bands;
}

export type QuestionStat = {
  questionId: string;
  /** Answer rows that exist for this question. */
  answered: number;
  /** Of those, the ones left empty. */
  blank: number;
  /** Of those, the ones carrying a mark. */
  marked: number;
  /** Mean mark over the marked rows. */
  mean: number;
  /** That mean as a percentage of the question's own marks. */
  pctOfMax: number;
};

/** One row per question, in the order given — a question nobody answered is
 *  still a row, because its absence is the finding. */
export function questionStats(
  questions: { id: string; points: number }[],
  answers: ScoreAnswer[],
): QuestionStat[] {
  const byQ = new Map<string, ScoreAnswer[]>();
  for (const a of answers) {
    const list = byQ.get(a.question_id) ?? [];
    list.push(a);
    byQ.set(a.question_id, list);
  }

  return questions.map((q) => {
    const rows = byQ.get(q.id) ?? [];
    const marked = rows.filter((a) => markOf(a) !== null);
    const total = marked.reduce((sum, a) => sum + Number(markOf(a) ?? 0), 0);
    const mean = marked.length ? total / marked.length : 0;
    const points = Number(q.points);
    return {
      questionId: q.id,
      answered: rows.length,
      blank: rows.filter((a) => responseIsEmpty(a.response)).length,
      marked: marked.length,
      mean,
      pctOfMax: points > 0 ? (mean / points) * 100 : 0,
    } satisfies QuestionStat;
  });
}

export type OptionTally = {
  position: number;
  value: string;
  correct: boolean;
  count: number;
};

/**
 * How many students picked each option.
 *
 * A pick of an option that no longer exists is dropped — the key was edited
 * after they answered, and inventing a row for it would say the option is
 * still on the paper. `blank` counts answers with nothing selected at all.
 */
export function tallyOptions(
  options: QuestionOption[],
  answers: { response?: unknown }[],
): { tallies: OptionTally[]; blank: number } {
  const counts = new Map<number, number>();
  let blank = 0;

  for (const a of answers) {
    const picked = [...new Set(selectedOf(a.response))];
    if (picked.length === 0) {
      blank++;
      continue;
    }
    for (const p of picked) counts.set(p, (counts.get(p) ?? 0) + 1);
  }

  return {
    tallies: options.map((o) => ({
      position: o.position,
      value: o.value,
      correct: o.correct,
      count: counts.get(o.position) ?? 0,
    })),
    blank,
  };
}
