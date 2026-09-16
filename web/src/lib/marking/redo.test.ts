import { describe, expect, it } from "vitest";
import { REDO_THRESHOLD_PCT, redoVerdict } from "./redo";

/* ── fixtures ───────────────────────────────────────────────────────────── */

const question = (id: string, isBonus = false) => ({ id, is_bonus: isBonus });
const mark = (questionId: string, finalMarks: number | null) => ({
  question_id: questionId,
  final_marks: finalMarks,
});

/** A normal graded paper marked inside the app — the only case with a verdict. */
const homework = (totalMarks: number, isGraded = true) => ({
  total_marks: totalMarks,
  is_graded: isGraded,
});
const appMarked = { imported_marks: null };

/* ── the line ───────────────────────────────────────────────────────────── */

describe("redoVerdict", () => {
  it("sends back a paper a fraction under the line", () => {
    expect(redoVerdict([mark("q1", 59.9)], [question("q1")], homework(100), appMarked))
      .toEqual({ pct: 59.9, redo: true });
  });

  it("lets exactly the threshold pass — 'less than 60' is the trigger", () => {
    expect(redoVerdict([mark("q1", 6)], [question("q1")], homework(10), appMarked))
      .toEqual({ pct: 60, redo: false });
    expect(REDO_THRESHOLD_PCT).toBe(60);
  });

  it("adds up every non-bonus answer on the paper", () => {
    const verdict = redoVerdict(
      [mark("q1", 3), mark("q2", 1.5), mark("q3", 0)],
      [question("q1"), question("q2"), question("q3")],
      homework(10),
      appMarked,
    );
    expect(verdict).toEqual({ pct: 45, redo: true });
  });

  it("reads an unmarked answer as zero rather than dropping it", () => {
    expect(redoVerdict([mark("q1", 6), mark("q2", null)], [question("q1"), question("q2")],
      homework(10), appMarked)).toEqual({ pct: 60, redo: false });
  });

  /* The same arithmetic as `v_hw_pct`, which sums `filter (where not
   * q.is_bonus)`. A bonus question is extra credit on top of `total_marks`,
   * so counting it here would let a paper pass on marks the average it is
   * compared against never saw. */
  it("leaves bonus marks out of the percentage", () => {
    const verdict = redoVerdict(
      [mark("q1", 5), mark("bonus", 3)],
      [question("q1"), question("bonus", true)],
      homework(10),
      appMarked,
    );
    expect(verdict).toEqual({ pct: 50, redo: true });
  });

  /* An answer can outlive its question — the teacher deleted it after the
   * student wrote. `total_marks` no longer covers it, so neither does this. */
  it("ignores an answer whose question is no longer on the paper", () => {
    expect(redoVerdict(
      [mark("q1", 6), mark("q-deleted", 4)],
      [question("q1")],
      homework(10),
      appMarked,
    )).toEqual({ pct: 60, redo: false });
  });

  /* ── no verdict at all ────────────────────────────────────────────────── */

  it("has no verdict on an ungraded homework", () => {
    expect(redoVerdict([mark("q1", 0)], [question("q1")], homework(10, false), appMarked))
      .toBeNull();
  });

  it("has no verdict when the paper is worth no marks", () => {
    for (const total of [0, -1]) {
      expect(redoVerdict([mark("q1", 0)], [question("q1")], homework(total), appMarked))
        .toBeNull();
    }
  });

  /* An imported mark is a total carried over from the old Forms sheet; there
   * are no per-question marks behind it to redo against. */
  it("has no verdict on an imported mark, however low", () => {
    expect(redoVerdict([mark("q1", 0)], [question("q1")], homework(10), { imported_marks: 12 }))
      .toBeNull();
    // zero is a real imported total, not "no import"
    expect(redoVerdict([mark("q1", 0)], [question("q1")], homework(10), { imported_marks: 0 }))
      .toBeNull();
  });

  it("has no verdict when there are no answers at all", () => {
    expect(redoVerdict([], [question("q1")], homework(10), appMarked)).toBeNull();
  });

  /* Every answer belonging to a deleted question is not the same as a paper
   * with no answers — but it scores 0, which is a real fail. */
  it("still fails a paper whose every answer lost its question", () => {
    expect(redoVerdict([mark("q-deleted", 9)], [question("q1")], homework(10), appMarked))
      .toEqual({ pct: 0, redo: true });
  });
});
