/**
 * Does an approved submission have to be done again? — pure, no IO.
 *
 * Releasing a mark below 60% sends the paper back for a redo (see
 * `docs/superpowers/specs/2026-09-15-homework-redo-design.md`). The decision
 * is a percentage and a comparison, so it lives here rather than inside
 * `approveSubmission`: the threshold is a rule about the programme, and the
 * one place that acts on it is a server action that cannot be unit-tested
 * without a database.
 *
 * The arithmetic deliberately mirrors `v_hw_pct` (migration 0006): non-bonus
 * final marks over `total_marks`. If the two ever disagree a student could be
 * sent back for a mark their own progress page calls a pass.
 */

/** Below this, the paper comes back. Exactly 60 passes. */
export const REDO_THRESHOLD_PCT = 60;

export type RedoVerdict = { pct: number; redo: boolean };

/**
 * The percentage this attempt scored, and whether it is a redo — or null when
 * the question does not arise at all.
 *
 * Null rather than `{ redo: false }` because the caller must be able to tell
 * "passed" from "no verdict was possible": an ungraded homework, a paper worth
 * no marks, a total imported from the old Forms sheet (there are no
 * per-question marks behind it), or a submission with no answers on it.
 * Treating any of those as a fail would send a student back to a paper that
 * cannot be passed.
 */
export function redoVerdict(
  finalMarks: readonly { question_id: string; final_marks: number | null }[],
  questions: readonly { id: string; is_bonus: boolean }[],
  homework: { total_marks: number; is_graded: boolean },
  submission: { imported_marks: number | null },
): RedoVerdict | null {
  if (!homework.is_graded) return null;
  if (!(homework.total_marks > 0)) return null;
  if (submission.imported_marks !== null) return null;
  if (finalMarks.length === 0) return null;

  const counts = new Map(questions.map((q) => [q.id, !q.is_bonus]));
  let sum = 0;
  for (const row of finalMarks) {
    // an answer whose question has been deleted is off the paper, and
    // `total_marks` no longer covers it — same as the view's inner join
    if (counts.get(row.question_id)) sum += row.final_marks ?? 0;
  }

  const pct = (sum / homework.total_marks) * 100;
  return { pct, redo: pct < REDO_THRESHOLD_PCT };
}
