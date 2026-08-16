"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MixedText } from "@/components/app/mixed-text";
import { VoicePlayback } from "@/components/app/voice-playback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { approveSubmission } from "@/lib/marking/actions";
import { selectedOf, textOf, fmtMarks, parseMarkInput } from "@/lib/homework/logic";
import { cn } from "@/lib/utils";

export type ReviewQuestion = {
  id: string;
  position: number;
  prompt: string;
  points: number;
  qtype: string;
  is_bonus: boolean;
  is_task: boolean;
  options: { position: number; value: string; correct: boolean }[] | null;
};

export type ReviewAnswer = {
  id: string;
  question_id: string;
  response: unknown;
  auto_marks: number | null;
  auto_rubric: { id: string; present: boolean; why?: string }[] | null;
  final_marks: number | null;
  teacher_comment: string | null;
};

export type ReviewVoiceNote = {
  question_id: string;
  storage_path: string;
  duration_s: number | null;
};

/**
 * Accept-or-edit review. Every mark is pre-filled with the automatic one;
 * the teacher changes what they disagree with and approves once. An approved
 * submission opens locked, but "Edit marks" reopens it — re-approving simply
 * overwrites the final marks and comments, so old homework stays correctable.
 *
 * Marks are typed into a plain text field rather than a number input: the
 * spinner arrows were never the way anyone enters a mark, and they crowd out
 * the denominator, which is the number a teacher actually needs to see. The
 * validation `type="number"` used to provide lives in `parseMarkInput` instead.
 */
export function ReviewPanel({
  submissionId,
  questions,
  answers,
  voiceNotes = [],
  approved,
  backHref = "/teacher/homework",
}: {
  submissionId: string;
  questions: ReviewQuestion[];
  answers: ReviewAnswer[];
  voiceNotes?: ReviewVoiceNote[];
  approved: boolean;
  backHref?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const locked = approved && !editing;
  const byQ = new Map(answers.map((a) => [a.question_id, a]));
  const voiceByQ = new Map(voiceNotes.map((v) => [v.question_id, v]));

  const [edits, setEdits] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      answers.map((a) => [a.id, String(a.final_marks ?? a.auto_marks ?? "")]),
    ),
  );
  const [comments, setComments] = useState<Record<string, string>>(() =>
    Object.fromEntries(answers.map((a) => [a.id, a.teacher_comment ?? ""])),
  );

  // Every typed mark read once, against its own question's points: the running
  // total, the per-field flag and the approve button all follow from this. Keyed
  // by ANSWER, so a row whose question has since been deleted still carries its
  // mark through approval — it has no field on screen and nothing to bound it.
  const pointsOf = new Map(questions.map((q) => [q.id, q.points]));
  const marks = new Map(
    answers.map((a) => [
      a.id,
      parseMarkInput(edits[a.id] ?? "", pointsOf.get(a.question_id) ?? Infinity),
    ]),
  );

  // What approval will write, and what the running total adds up — one map, so
  // the number on screen and the number saved can never drift apart. A field
  // left blank reads as zero, which is what the total above it already showed.
  const finalMarks = new Map<string, number>();
  for (const q of questions) {
    const a = byQ.get(q.id);
    if (a) finalMarks.set(a.id, marks.get(a.id)!.value ?? 0);
  }
  for (const a of answers) {
    // an answer with no question on screen: nothing to type into, so it only
    // passes through the mark it already had
    const m = marks.get(a.id)!;
    if (!finalMarks.has(a.id) && m.value !== null) finalMarks.set(a.id, m.value);
  }

  // only the questions on screen count towards the total, as before
  const total = questions.reduce((sum, q) => {
    const a = byQ.get(q.id);
    return sum + (a ? finalMarks.get(a.id)! : 0);
  }, 0);
  const outOf = questions.filter((q) => !q.is_bonus).reduce((s, q) => s + q.points, 0);
  const needsAttention = answers.filter((a) => a.auto_marks === null).length;
  // kept with their position so the warning can name the question
  const invalid = questions
    .map((q, i) => ({ q, n: i + 1, a: byQ.get(q.id) }))
    .filter(({ a }) => a && !marks.get(a.id)!.valid);

  return (
    <div className="space-y-4">
      <div className="box c12" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Running total</div>
          <div className="font-heading text-2xl tabular-nums">
            {fmtMarks(total)}<span className="text-muted-foreground"> / {fmtMarks(outOf)}</span>
          </div>
        </div>
        {invalid.length > 0 && !locked ? (
          <p className="text-xs text-danger">
            Q{invalid[0].n}: a mark has to be a number from 0 to{" "}
            {fmtMarks(invalid[0].q.points)}.
            {invalid.length > 1 && ` (${invalid.length - 1} more like it.)`}
          </p>
        ) : (
          needsAttention > 0 && !locked && (
            <p className="text-xs text-warn">
              {needsAttention} answer{needsAttention === 1 ? "" : "s"} could not be marked automatically — enter a mark below.
            </p>
          )
        )}
        {!locked && (
          <Button
            disabled={pending || invalid.length > 0}
            onClick={() =>
              startTransition(async () => {
                await approveSubmission(
                  submissionId,
                  Object.fromEntries(finalMarks),
                  comments,
                );
                if (approved) {
                  // an edit of released marks: stay put, show the new state
                  setEditing(false);
                  router.refresh();
                } else {
                  router.push(backHref);
                  router.refresh();
                }
              })
            }
          >
            {pending ? "Saving…" : approved ? "Save changes" : "Approve and release"}
          </Button>
        )}
        {locked && (
          <span className="flex items-center gap-2">
            <span className="rounded-md bg-ok/12 px-2.5 py-1 text-xs font-medium text-ok">
              Approved — the student can see this
            </span>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              Edit marks
            </Button>
          </span>
        )}
      </div>

      {questions.map((q, i) => {
        const a = byQ.get(q.id);
        if (!a) return null;
        const chosen = selectedOf(a.response);
        const text = textOf(a.response);

        return (
          <section key={q.id} className="box c12">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <span>Q{i + 1}</span>
                  {q.is_bonus && <span className="rounded bg-muted px-1.5 py-0.5 normal-case">bonus</span>}
                  {q.is_task && <span className="rounded bg-muted px-1.5 py-0.5 normal-case">task</span>}
                </div>
                <MixedText text={q.prompt} variant="quran" className="mt-2 block text-[15px] leading-relaxed" />
              </div>
              <div className="shrink-0">
                <label
                  htmlFor={`mark-${a.id}`}
                  className="text-[11px] uppercase tracking-wider text-muted-foreground"
                >
                  Mark
                </label>
                <div className="mt-1 flex items-center gap-1.5">
                  <Input
                    id={`mark-${a.id}`}
                    inputMode="decimal"
                    autoComplete="off"
                    aria-invalid={!marks.get(a.id)!.valid}
                    aria-describedby={`out-of-${a.id}`}
                    disabled={locked}
                    value={edits[a.id] ?? ""}
                    onChange={(e) => setEdits((s) => ({ ...s, [a.id]: e.target.value }))}
                    className="w-16 text-right tabular-nums"
                  />
                  {/* the denominator belongs next to the field, not in the grey
                      meta line above the prompt where it used to live */}
                  <span id={`out-of-${a.id}`} className="text-sm tabular-nums text-muted-foreground">
                    / {fmtMarks(q.points)}
                  </span>
                </div>
                {a.auto_marks !== null && (
                  <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                    auto: {fmtMarks(a.auto_marks)}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {q.options ? (
                <ul className="space-y-1">
                  {q.options.map((o) => {
                    const picked = chosen.includes(o.position);
                    return (
                      <li key={o.position} className={cn(
                        "flex items-start gap-2 rounded-md px-2.5 py-1.5 text-sm",
                        picked && o.correct && "bg-ok/10",
                        picked && !o.correct && "bg-danger/10",
                        !picked && o.correct && "bg-muted",
                      )}>
                        <span className="w-10 shrink-0 text-xs text-muted-foreground">
                          {picked ? "chose" : o.correct ? "key" : ""}
                        </span>
                        <MixedText text={o.value} />
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="rounded-md border border-line bg-page p-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {q.is_task ? "Student recitation" : "Student answer"}
                  </div>
                  {q.is_task ? (
                    voiceByQ.has(q.id) ? (
                      <div className="mt-1.5">
                        <VoicePlayback
                          storagePath={voiceByQ.get(q.id)!.storage_path}
                          durationS={voiceByQ.get(q.id)!.duration_s}
                          label="Recorded in the app"
                        />
                      </div>
                    ) : (
                      <p className="mt-1.5 text-sm italic text-muted-foreground">
                        Nothing recorded for this task.
                      </p>
                    )
                  ) : text ? (
                    <MixedText text={text} className="mt-1.5 block text-sm leading-relaxed" />
                  ) : (
                    <p className="mt-1.5 text-sm italic text-muted-foreground">No answer given.</p>
                  )}
                </div>
              )}

              {a.auto_rubric && (
                <ul className="flex flex-wrap gap-1.5">
                  {a.auto_rubric.map((c) => (
                    <li key={c.id} className={cn(
                      "rounded-md px-2 py-1 text-xs",
                      c.present ? "bg-ok/12 text-ok" : "bg-danger/12 text-danger",
                    )}>
                      {c.present ? "✓" : "✗"} {c.why ?? c.id}
                    </li>
                  ))}
                </ul>
              )}

              {a.auto_marks === null && !q.is_task && (
                <p className="text-xs text-warn">
                  Needs your judgement — no answer key or rubric for this one.
                </p>
              )}

              {/* Written answers and recitation tasks get a comment; multiple
                  choice doesn't, since the option list already says everything
                  there is to say. Only these carry no options.
                  Saved on approval with the marks — not as you type — so the
                  student never sees feedback on an unreleased submission.
                  Hidden once locked unless there is something to read. */}
              {!q.options && (!locked || comments[a.id]) && (
                <div>
                  <label
                    htmlFor={`comment-${a.id}`}
                    className="text-[11px] uppercase tracking-wider text-muted-foreground"
                  >
                    Comment for the student
                    {!locked && <span className="normal-case"> (optional)</span>}
                  </label>
                  <Textarea
                    id={`comment-${a.id}`}
                    rows={2}
                    disabled={locked}
                    value={comments[a.id] ?? ""}
                    onChange={(e) => setComments((s) => ({ ...s, [a.id]: e.target.value }))}
                    placeholder={
                      q.is_task
                        ? "What to work on in their recitation."
                        : "They'll see this with their mark."
                    }
                    className="mt-1"
                  />
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
