import { MixedText } from "@/components/app/mixed-text";
import { TapWords } from "@/components/app/tap-words";
import { VoicePlayback } from "@/components/app/voice-playback";
import { isTapWords } from "@/lib/homework/tap-words";
import { fmtMarks, selectedOf, textOf } from "@/lib/homework/logic";
import type { ReviewQuestion } from "@/components/app/review-panel";

/**
 * The attempts a student has already had at this paper, read-only.
 *
 * A redo blanks the live submission — the answers and voice notes are moved
 * into a `submission_attempts` snapshot and deleted, because the student has
 * to write the paper again without their old answers in front of them (see
 * docs/superpowers/specs/2026-09-15-homework-redo-design.md). This component
 * is therefore the ONLY place the earlier script can still be read, and only a
 * teacher ever reaches it: `submission_attempts` has one RLS policy and it is
 * `is_teacher()`.
 *
 * Collapsed by default, and a plain `<details>` rather than a toggle of our
 * own: the teacher opened this page to mark the attempt in front of them, and
 * the previous one is context they ask for, not something to scroll past.
 *
 * Nothing here is editable. An old mark is a fact about an attempt that has
 * been superseded; changing it would change a percentage the student has
 * already been told and a redo that has already been set going.
 */

export type PastAttempt = {
  attempt: number;
  pct: number | null;
  approved_at: string | null;
  /** The teacher who released it. Null when the join found no name. */
  approver: string | null;
  is_late: boolean;
  /** jsonb, straight off the row — shape is checked here, not trusted. */
  answers: unknown;
  /** jsonb, likewise. */
  voice_notes: unknown;
};

type SnapshotAnswer = {
  question_id: string;
  response: unknown;
  final_marks: number | null;
  teacher_comment: string | null;
};

type SnapshotVoice = {
  question_id: string;
  storage_path: string;
  duration_s: number | null;
};

/**
 * The snapshots are aggregated by a plpgsql function into a jsonb column, so
 * TypeScript knows nothing about them and a migration could change their shape
 * under us. Anything that isn't the expected object is dropped rather than
 * thrown on — a teacher reading an old script would rather see "no answers
 * recorded" than a crashed marking page.
 */
function parseSnapshotAnswers(json: unknown): SnapshotAnswer[] {
  if (!Array.isArray(json)) return [];
  const out: SnapshotAnswer[] = [];
  for (const row of json) {
    if (typeof row !== "object" || row === null) continue;
    const r = row as Record<string, unknown>;
    if (typeof r.question_id !== "string") continue;
    out.push({
      question_id: r.question_id,
      response: r.response,
      final_marks: typeof r.final_marks === "number" ? r.final_marks : null,
      teacher_comment: typeof r.teacher_comment === "string" ? r.teacher_comment : null,
    });
  }
  return out;
}

function parseSnapshotVoice(json: unknown): SnapshotVoice[] {
  if (!Array.isArray(json)) return [];
  const out: SnapshotVoice[] = [];
  for (const row of json) {
    if (typeof row !== "object" || row === null) continue;
    const r = row as Record<string, unknown>;
    if (typeof r.question_id !== "string" || typeof r.storage_path !== "string") continue;
    out.push({
      question_id: r.question_id,
      storage_path: r.storage_path,
      duration_s: typeof r.duration_s === "number" ? r.duration_s : null,
    });
  }
  return out;
}

/** "3 Sep" — the day it went back, which is all the summary line has room for. */
function releasedOn(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** `Attempt 1 · 45% · released 3 Sep by Ustadh X`, minus whatever is missing. */
function summaryLine(a: PastAttempt): string {
  const parts = [`Attempt ${a.attempt}`];
  if (a.pct !== null) parts.push(`${Math.round(a.pct)}%`);
  const when = a.approved_at ? releasedOn(a.approved_at) : "";
  if (when || a.approver) {
    parts.push(
      ["released", when, a.approver ? `by ${a.approver}` : ""]
        .filter(Boolean)
        .join(" "),
    );
  }
  return parts.join(" · ");
}

export function PastAttempts({
  attempts,
  questions,
}: {
  attempts: PastAttempt[];
  /** The paper as it stands now — a question deleted since is simply gone. */
  questions: ReviewQuestion[];
}) {
  if (attempts.length === 0) return null;

  const ordered = [...attempts].sort((a, b) => b.attempt - a.attempt);
  const inOrder = [...questions].sort((a, b) => a.position - b.position);

  return (
    <section className="box c12 mb-4">
      <span className="label">Previous attempts</span>
      <p className="text-xs text-muted-foreground">
        Sent back for a redo. The student cannot see any of this: not their
        answers, not the marks, not the comments.
      </p>

      <div className="mt-1 divide-y divide-line border-y border-line">
        {ordered.map((a) => {
          const answers = parseSnapshotAnswers(a.answers);
          const byQ = new Map(answers.map((row) => [row.question_id, row]));
          const voice = parseSnapshotVoice(a.voice_notes);
          const voiceByQ = new Map(voice.map((v) => [v.question_id, v]));
          // An attempt that was nothing but recitations has no answers at all,
          // and saying "no answers recorded" over a page of recordings would be
          // a plain lie — the attempt is empty only when both snapshots are.
          const empty = answers.length === 0 && voice.length === 0;

          return (
            <details key={a.attempt} className="py-2.5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate tabular-nums">{summaryLine(a)}</span>
                {a.is_late && (
                  <span className="shrink-0 rounded bg-warn/12 px-1.5 py-0.5 text-xs text-warn">
                    late
                  </span>
                )}
              </summary>

              {empty ? (
                <p className="mt-2 text-sm italic text-muted-foreground">
                  Nothing recorded on this attempt.
                </p>
              ) : (
                <ol className="mt-3 space-y-3">
                  {inOrder.map((q, i) => {
                    const row = byQ.get(q.id);
                    // Same rule as the live panel: a task is on the paper
                    // whether or not it left an answers row behind, because
                    // the recording is the work and the snapshot keeps it
                    // separately. Anything else with no row went unanswered.
                    if (!row && !q.is_task) return null;
                    const chosen = row ? selectedOf(row.response) : [];
                    const text = row ? textOf(row.response) : "";
                    const note = voiceByQ.get(q.id);

                    return (
                      <li key={q.id} className="qn rounded-md border border-line bg-page p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                              Q{i + 1}
                            </div>
                            <MixedText
                              text={q.prompt}
                              variant="quran"
                              className="mt-1 block text-sm leading-relaxed"
                            />
                          </div>
                          <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                            {/* A task was never marked, so it shows a dash and
                                no denominator, exactly as the live panel does. */}
                            {q.is_task ? (
                              "—"
                            ) : (
                              <>
                                {row?.final_marks == null ? "—" : fmtMarks(row.final_marks)} /{" "}
                                {fmtMarks(q.points)}
                              </>
                            )}
                          </span>
                        </div>

                        <div className="mt-2 text-sm">
                          {isTapWords(q.options) ? (
                            /* Their taps with the key drawn over them, the same
                               way the live panel shows a tap-the-rule answer —
                               a bare list of Arabic words says nothing. */
                            <TapWords options={q.options!} selected={chosen} readOnly reveal />
                          ) : q.options ? (
                            chosen.length ? (
                              <ul className="space-y-1">
                                {q.options
                                  .filter((o) => chosen.includes(o.position))
                                  .map((o) => (
                                    <li key={o.position}>
                                      <MixedText text={o.value} variant="quran" />
                                    </li>
                                  ))}
                              </ul>
                            ) : (
                              <p className="italic text-muted-foreground">No answer given.</p>
                            )
                          ) : q.is_task ? (
                            note ? (
                              /* The recording outlived the redo on purpose: the
                                 snapshot keeps its path and the file is never
                                 deleted from storage. */
                              <VoicePlayback
                                storagePath={note.storage_path}
                                durationS={note.duration_s}
                                label="Recorded in the app"
                              />
                            ) : (
                              <p className="italic text-muted-foreground">
                                Nothing recorded for this task.
                              </p>
                            )
                          ) : text ? (
                            <MixedText text={text} variant="quran" className="block leading-relaxed" />
                          ) : (
                            <p className="italic text-muted-foreground">No answer given.</p>
                          )}
                        </div>

                        {row?.teacher_comment && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            <span className="uppercase tracking-wider">Comment</span>{" "}
                            {row.teacher_comment}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </details>
          );
        })}
      </div>
    </section>
  );
}
