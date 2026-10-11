/**
 * Released papers with a question still to mark — pure logic.
 *
 * A paper is normally marked in full before it is released. It can come back
 * with a gap when a question changes afterwards: HW2's Q6 became a 3-mark
 * recitation (0085) on papers already released, and its answers were cleared
 * to "not marked yet". Each such answer is a row here. Once the teacher saves
 * a mark the row is gone, so the list empties itself.
 */

export type RemarkHomework = { number: number; series: string; title: string };

export type RemarkRow = {
  submission_id: string;
  student_id: string;
  position: number;
  homework: RemarkHomework | null;
};

export type RemarkItem = {
  submissionId: string;
  studentId: string;
  homework: RemarkHomework | null;
  /** question positions, ascending: "Q6" on the paper */
  positions: number[];
};

/** One item per paper, oldest homework first, then by student. */
export function remarkItems(rows: RemarkRow[], nameOf: (id: string) => string): RemarkItem[] {
  const bySub = new Map<string, RemarkItem>();
  for (const r of rows) {
    const item = bySub.get(r.submission_id) ?? {
      submissionId: r.submission_id,
      studentId: r.student_id,
      homework: r.homework,
      positions: [],
    };
    if (!item.positions.includes(r.position)) item.positions.push(r.position);
    bySub.set(r.submission_id, item);
  }
  return [...bySub.values()]
    .map((i) => ({ ...i, positions: i.positions.sort((a, b) => a - b) }))
    .sort(
      (a, b) =>
        (a.homework?.number ?? Infinity) - (b.homework?.number ?? Infinity) ||
        nameOf(a.studentId).localeCompare(nameOf(b.studentId)),
    );
}
