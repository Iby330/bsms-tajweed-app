import { describe, expect, it } from "vitest";
import {
  histogram,
  questionStats,
  scoreSubmissions,
  spread,
  tallyOptions,
  type ScoreAnswer,
} from "./responses";

// ─── helpers ────────────────────────────────────────────────────────────────

const sub = (id: string, status = "approved", imported?: number | null) => ({
  id,
  student_id: `student-${id}`,
  status,
  ...(imported === undefined ? {} : { imported_marks: imported }),
});

const ans = (
  submission: string,
  question: string,
  marks: { auto?: number | null; final?: number | null; response?: unknown } = {},
): ScoreAnswer => ({
  submission_id: submission,
  question_id: question,
  auto_marks: marks.auto ?? null,
  final_marks: marks.final ?? null,
  response: marks.response,
});

const opt = (position: number, value: string, correct = false) => ({
  position,
  label: `Option ${position}`,
  value,
  correct,
});

// ─── scoreSubmissions ───────────────────────────────────────────────────────

describe("scoreSubmissions", () => {
  const questions = [
    { id: "q1", is_bonus: false },
    { id: "q2", is_bonus: false },
    { id: "bonus", is_bonus: true },
  ];

  it("sums the final mark, falling back to the automatic one", () => {
    const scored = scoreSubmissions(
      [sub("s1")],
      [ans("s1", "q1", { auto: 1, final: 3 }), ans("s1", "q2", { auto: 2 })],
      questions,
      10,
    );
    expect(scored).toEqual([
      { submissionId: "s1", studentId: "student-s1", approved: true, marks: 5, pct: 50 },
    ]);
  });

  it("leaves bonus marks out of the total, as v_hw_pct_all does", () => {
    const scored = scoreSubmissions(
      [sub("s1")],
      [ans("s1", "q1", { final: 4 }), ans("s1", "bonus", { final: 6 })],
      questions,
      10,
    );
    expect(scored[0].marks).toBe(4);
    expect(scored[0].pct).toBe(40);
  });

  it("drops an answer whose question no longer exists", () => {
    const scored = scoreSubmissions(
      [sub("s1")],
      [ans("s1", "q1", { final: 2 }), ans("s1", "deleted", { final: 5 })],
      questions,
      10,
    );
    expect(scored[0].marks).toBe(2);
  });

  it("skips a submission that has been handed in but not marked", () => {
    const scored = scoreSubmissions(
      [sub("s1", "submitted")],
      [ans("s1", "q1"), ans("s1", "q2")],
      questions,
      10,
    );
    expect(scored).toEqual([]);
  });

  it("counts a provisional auto mark, flagged as not approved", () => {
    const scored = scoreSubmissions(
      [sub("s1", "auto_marked")],
      [ans("s1", "q1", { auto: 7 })],
      questions,
      10,
    );
    expect(scored[0]).toMatchObject({ approved: false, marks: 7, pct: 70 });
  });

  it("falls back to the imported total when there are no answer rows", () => {
    const scored = scoreSubmissions([sub("s1", "approved", 8)], [], questions, 10);
    expect(scored[0].marks).toBe(8);
  });

  it("prefers marked answers over an imported total", () => {
    const scored = scoreSubmissions(
      [sub("s1", "approved", 8)],
      [ans("s1", "q1", { final: 3 })],
      questions,
      10,
    );
    expect(scored[0].marks).toBe(3);
  });

  it("reports 0% rather than dividing by a homework worth nothing", () => {
    const scored = scoreSubmissions([sub("s1")], [ans("s1", "q1", { final: 2 })], questions, 0);
    expect(scored[0].pct).toBe(0);
  });
});

// ─── spread ─────────────────────────────────────────────────────────────────

describe("spread", () => {
  it("is null for no marks at all", () => {
    expect(spread([])).toBeNull();
  });

  it("takes the middle value of an odd set", () => {
    expect(spread([50, 10, 90])).toEqual({
      count: 3, mean: 50, median: 50, min: 10, max: 90,
    });
  });

  it("averages the middle pair of an even set", () => {
    expect(spread([10, 20, 40, 90])).toMatchObject({ median: 30, mean: 40 });
  });

  it("does not mutate the caller's array", () => {
    const values = [3, 1, 2];
    spread(values);
    expect(values).toEqual([3, 1, 2]);
  });
});

// ─── histogram ──────────────────────────────────────────────────────────────

describe("histogram", () => {
  it("buckets into 20-point bands by default", () => {
    expect(histogram([0, 19, 20, 55, 99])).toEqual([
      { from: 0, to: 20, count: 2 },
      { from: 20, to: 40, count: 1 },
      { from: 40, to: 60, count: 1 },
      { from: 60, to: 80, count: 0 },
      { from: 80, to: 100, count: 1 },
    ]);
  });

  it("puts full marks in the top band rather than one of its own", () => {
    expect(histogram([100]).at(-1)).toEqual({ from: 80, to: 100, count: 1 });
  });

  it("clamps a stray mark outside 0–100 into the end bands", () => {
    const bands = histogram([-5, 140]);
    expect(bands[0].count).toBe(1);
    expect(bands.at(-1)!.count).toBe(1);
  });

  it("honours a band size", () => {
    expect(histogram([5, 15], 10)).toHaveLength(10);
  });
});

// ─── questionStats ──────────────────────────────────────────────────────────

describe("questionStats", () => {
  const questions = [{ id: "q1", points: 4 }, { id: "q2", points: 2 }];

  it("averages only the marked rows", () => {
    const stats = questionStats(questions, [
      ans("s1", "q1", { final: 4, response: { text: "yes" } }),
      ans("s2", "q1", { auto: 2, response: { text: "half" } }),
      ans("s3", "q1", { response: { text: "unmarked" } }),
    ]);
    expect(stats[0]).toMatchObject({ answered: 3, marked: 2, mean: 3, pctOfMax: 75 });
  });

  it("counts empty answers as blanks", () => {
    const stats = questionStats(questions, [
      ans("s1", "q1", { final: 0, response: { text: "" } }),
      ans("s2", "q1", { final: 4, response: { text: "something" } }),
    ]);
    expect(stats[0].blank).toBe(1);
  });

  it("keeps a row for a question nobody answered", () => {
    const stats = questionStats(questions, [ans("s1", "q1", { final: 4 })]);
    expect(stats[1]).toMatchObject({ questionId: "q2", answered: 0, mean: 0, pctOfMax: 0 });
  });

  it("reports 0% for a question worth no marks rather than dividing by zero", () => {
    const stats = questionStats([{ id: "task", points: 0 }], [ans("s1", "task", { final: 0 })]);
    expect(stats[0].pctOfMax).toBe(0);
  });
});

// ─── tallyOptions ───────────────────────────────────────────────────────────

describe("tallyOptions", () => {
  const options = [opt(0, "Iẓhār"), opt(1, "Idghām", true), opt(2, "Iqlāb")];

  it("counts a pick per option", () => {
    const { tallies } = tallyOptions(options, [
      { response: { selected: [1] } },
      { response: { selected: [1] } },
      { response: { selected: [0] } },
    ]);
    expect(tallies.map((t) => t.count)).toEqual([1, 2, 0]);
    expect(tallies[1].correct).toBe(true);
  });

  it("counts every box of a multi-select once", () => {
    const { tallies } = tallyOptions(options, [{ response: { selected: [0, 1, 1] } }]);
    expect(tallies.map((t) => t.count)).toEqual([1, 1, 0]);
  });

  it("counts an answer with nothing selected as blank", () => {
    const { tallies, blank } = tallyOptions(options, [
      { response: { selected: [] } },
      { response: {} },
      { response: { selected: [2] } },
    ]);
    expect(blank).toBe(2);
    expect(tallies[2].count).toBe(1);
  });

  it("ignores a pick of an option that has since been removed", () => {
    const { tallies, blank } = tallyOptions(options, [{ response: { selected: [9] } }]);
    expect(tallies.every((t) => t.count === 0)).toBe(true);
    expect(blank).toBe(0);
  });
});
