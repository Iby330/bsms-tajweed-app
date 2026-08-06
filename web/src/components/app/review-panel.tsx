"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MixedText } from "@/components/app/mixed-text";
import { VoicePlayback } from "@/components/app/voice-playback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { approveSubmission } from "@/lib/marking/actions";
import { selectedOf, textOf, fmtMarks } from "@/lib/homework/logic";
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
};

export type ReviewVoiceNote = {
  question_id: string;
  storage_path: string;
  duration_s: number | null;
};

/**
 * Accept-or-edit review. Every mark is pre-filled with the automatic one;
 * the teacher changes what they disagree with and approves once.
 */
export function ReviewPanel({
  submissionId,
  questions,
  answers,
  voiceNotes = [],
  approved,
}: {
  submissionId: string;
  questions: ReviewQuestion[];
  answers: ReviewAnswer[];
  voiceNotes?: ReviewVoiceNote[];
  approved: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const byQ = new Map(answers.map((a) => [a.question_id, a]));
  const voiceByQ = new Map(voiceNotes.map((v) => [v.question_id, v]));

  const [edits, setEdits] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      answers.map((a) => [a.id, String(a.final_marks ?? a.auto_marks ?? "")]),
    ),
  );

  const total = questions.reduce((sum, q) => {
    const a = byQ.get(q.id);
    if (!a) return sum;
    const n = Number(edits[a.id]);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
  const outOf = questions.filter((q) => !q.is_bonus).reduce((s, q) => s + q.points, 0);
  const needsAttention = answers.filter((a) => a.auto_marks === null).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-card p-4">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Running total</div>
          <div className="font-heading text-2xl tabular-nums">
            {fmtMarks(total)}<span className="text-muted-foreground"> / {fmtMarks(outOf)}</span>
          </div>
        </div>
        {needsAttention > 0 && !approved && (
          <p className="text-xs text-warn">
            {needsAttention} answer{needsAttention === 1 ? "" : "s"} could not be marked automatically — enter a mark below.
          </p>
        )}
        {!approved && (
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const parsed: Record<string, number> = {};
                for (const [id, v] of Object.entries(edits)) {
                  const n = Number(v);
                  if (Number.isFinite(n)) parsed[id] = n;
                }
                await approveSubmission(submissionId, parsed);
                router.push("/teacher/review");
                router.refresh();
              })
            }
          >
            {pending ? "Approving…" : "Approve and release"}
          </Button>
        )}
        {approved && (
          <span className="rounded-md bg-ok/12 px-2.5 py-1 text-xs font-medium text-ok">
            Approved — the student can see this
          </span>
        )}
      </div>

      {questions.map((q, i) => {
        const a = byQ.get(q.id);
        if (!a) return null;
        const chosen = selectedOf(a.response);
        const text = textOf(a.response);

        return (
          <section key={q.id} className="rounded-lg border border-line bg-card p-4 sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <span>Q{i + 1}</span>
                  {q.is_bonus && <span className="rounded bg-muted px-1.5 py-0.5 normal-case">bonus</span>}
                  {q.is_task && <span className="rounded bg-muted px-1.5 py-0.5 normal-case">task</span>}
                  <span className="tabular-nums">out of {fmtMarks(q.points)}</span>
                </div>
                <MixedText text={q.prompt} variant="quran" className="mt-2 block text-[15px] leading-relaxed" />
              </div>
              <div className="w-24 shrink-0">
                <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Mark</label>
                <Input
                  type="number" step="0.5" min={0} max={q.points}
                  disabled={approved}
                  value={edits[a.id] ?? ""}
                  onChange={(e) => setEdits((s) => ({ ...s, [a.id]: e.target.value }))}
                  className="mt-1 text-right tabular-nums"
                />
                {a.auto_marks !== null && (
                  <p className="mt-1 text-right text-[11px] text-muted-foreground tabular-nums">
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
            </div>
          </section>
        );
      })}
    </div>
  );
}
