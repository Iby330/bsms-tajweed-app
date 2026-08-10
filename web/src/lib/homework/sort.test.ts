import { describe, it, expect } from "vitest";
import type { HomeworkEntry } from "@/lib/curriculum/tree";
import { sortHomework, HOMEWORK_SORTS, type ScoredHomework } from "./sort";

const hw = (
  termId: number,
  week: number,
  pct: number | null,
  opts: { number?: number; series?: string } = {},
): ScoredHomework => ({
  entry: {
    termId,
    series: opts.series ?? "tajweed",
    courseLabel: "Tajweed",
    weekNumber: week,
    title: "",
    unlocked: true,
    submission: "approved",
    homework: {
      id: `t${termId}w${week}${opts.series ?? ""}`,
      week_id: `t${termId}w${week}`,
      number: opts.number ?? termId * 100 + week,
      series: opts.series ?? "tajweed",
      title: "",
      total_marks: 10,
      due_at: null,
      is_graded: true,
    },
  } satisfies HomeworkEntry,
  pct,
});

/** How the page arrives: newest term first, newest week first inside it. */
const marked = [
  hw(3, 3, 57), hw(3, 2, 100), hw(3, 1, 70),
  hw(2, 2, 90), hw(2, 1, 64),
  hw(1, 2, 55), hw(1, 1, 82),
];

const shape = (terms: ReturnType<typeof sortHomework>) =>
  terms.map((t) => [t.termId, t.rows.map((r) => r.entry.weekNumber)]);
const scores = (terms: ReturnType<typeof sortHomework>) =>
  terms.map((t) => [t.termId, t.rows.map((r) => r.pct)]);

describe("sortHomework — chronological", () => {
  it("'latest' reproduces the order the page already had", () => {
    // Newest term on top, newest week first inside it. Anything else would be
    // a silent change to a screen students already know.
    expect(shape(sortHomework(marked, "latest"))).toEqual([
      [3, [3, 2, 1]],
      [2, [2, 1]],
      [1, [2, 1]],
    ]);
  });

  it("'oldest' turns the whole year over, terms included", () => {
    // Read as one chronology from the start of the year: Term 1 week 1 IS the
    // oldest homework, so leaving Term 3 on top would contradict the label.
    expect(shape(sortHomework(marked, "oldest"))).toEqual([
      [1, [1, 2]],
      [2, [1, 2]],
      [3, [1, 2, 3]],
    ]);
  });

  it("orders two courses sharing a week by homework number", () => {
    // Term 3 runs Tajweed and TFP, so a week can hold two homeworks.
    const sameWeek = [
      hw(3, 1, 60, { number: 116, series: "tfp" }),
      hw(3, 1, 90, { number: 16 }),
    ];
    expect(sortHomework(sameWeek, "oldest")[0].rows.map((r) => r.entry.homework.number))
      .toEqual([16, 116]);
    expect(sortHomework(sameWeek, "latest")[0].rows.map((r) => r.entry.homework.number))
      .toEqual([116, 16]);
  });
});

describe("sortHomework — by score", () => {
  it("puts the best work first, within each term", () => {
    expect(scores(sortHomework(marked, "highest"))).toEqual([
      [3, [100, 70, 57]],
      [2, [90, 64]],
      [1, [82, 55]],
    ]);
  });

  it("puts the weakest work first — the whole point of the feature", () => {
    expect(scores(sortHomework(marked, "lowest"))).toEqual([
      [3, [57, 70, 100]],
      [2, [64, 90]],
      [1, [55, 82]],
    ]);
  });

  it("keeps the most recent term on top rather than ranking terms too", () => {
    // A mark only means something next to others from its own term; Term 1 and
    // Term 3 are different courses sat months apart.
    for (const sort of ["highest", "lowest"] as const) {
      expect(sortHomework(marked, sort).map((t) => t.termId)).toEqual([3, 2, 1]);
    }
  });

  it("sinks unmarked work to the bottom instead of scoring it zero", () => {
    // Treating "no mark" as 0 would head the "lowest first" list with work the
    // student was never marked on, burying the real weak spots underneath.
    const withUngraded = [hw(1, 3, null), hw(1, 2, 40), hw(1, 1, 95)];
    for (const sort of ["highest", "lowest"] as const) {
      const [term] = sortHomework(withUngraded, sort);
      expect(term.rows.at(-1)!.pct).toBeNull();
    }
    expect(scores(sortHomework(withUngraded, "lowest"))).toEqual([[1, [40, 95, null]]]);
  });

  it("treats a malformed mark as no mark rather than scrambling the sort", () => {
    const [term] = sortHomework([hw(1, 2, NaN), hw(1, 1, 70)], "highest");
    expect(term.rows.map((r) => r.entry.weekNumber)).toEqual([1, 2]);
  });

  it("breaks equal marks with the default order, so nothing is arbitrary", () => {
    const tied = [hw(1, 1, 70), hw(1, 3, 70), hw(1, 2, 70)];
    for (const sort of ["highest", "lowest"] as const) {
      expect(sortHomework(tied, sort)[0].rows.map((r) => r.entry.weekNumber)).toEqual([3, 2, 1]);
    }
  });
});

describe("sortHomework — invariants", () => {
  it("never drops or duplicates a row, whichever order is asked for", () => {
    for (const sort of HOMEWORK_SORTS) {
      const ids = sortHomework(marked, sort).flatMap((t) => t.rows.map((r) => r.entry.homework.id));
      expect(ids.slice().sort()).toEqual(marked.map((r) => r.entry.homework.id).slice().sort());
    }
  });

  it("never mutates the list it was handed", () => {
    const original = [...marked];
    for (const sort of HOMEWORK_SORTS) sortHomework(marked, sort);
    expect(marked).toEqual(original);
  });

  it("returns no terms at all for an empty list", () => {
    for (const sort of HOMEWORK_SORTS) expect(sortHomework([], sort)).toEqual([]);
  });
});
