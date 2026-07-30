"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MixedText } from "@/components/app/mixed-text";
import { MarkBadge } from "@/components/app/mark-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { saveAnswer, submitHomework } from "@/lib/homework/actions";
import {
  mcqResponse, checkboxResponse, textResponse,
  selectedOf, textOf, fmtMarks,
  type StudentQuestion,
} from "@/lib/homework/logic";
import { cn } from "@/lib/utils";

export type ExistingAnswer = {
  question_id: string;
  response: unknown;
  final_marks: number | null;
  auto_rubric: unknown;
};

/**
 * The homework form. Every prompt, option and answer renders through
 * <MixedText> because question text carries inline Qur'anic Arabic.
 *
 * Read-only once submitted; shows per-question marks once approved.
 */
export function HomeworkForm({
  submissionId,
  questions,
  existing,
  status,
  readOnly,
}: {
  submissionId: string | null;
  questions: StudentQuestion[];
  existing: ExistingAnswer[];
  status: string | null;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const byQ = new Map(existing.map((a) => [a.question_id, a]));

  const [answers, setAnswers] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(existing.map((a) => [a.question_id, a.response])),
  );
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach(clearTimeout);
  }, []);

  function update(questionId: string, response: unknown) {
    setAnswers((a) => ({ ...a, [questionId]: response }));
    if (!submissionId || readOnly) return;
    setSaved("saving");
    clearTimeout(timers.current[questionId]);
    timers.current[questionId] = setTimeout(() => {
      saveAnswer(submissionId, questionId, response)
        .then(() => setSaved("saved"))
        .catch(() => setSaved("idle"));
    }, 600);
  }

  const approved = status === "approved";
  const total = approved
    ? existing.reduce((s, a) => s + (a.final_marks ?? 0), 0)
    : null;
  const outOf = questions.filter((q) => !q.is_bonus).reduce((s, q) => s + q.points, 0);

  return (
    <div className="space-y-5">
      {approved && (
        <div className="rounded-lg border border-line bg-card p-4">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Your mark</div>
          <div className="mt-1 font-heading text-3xl tabular-nums">
            {fmtMarks(total ?? 0)}<span className="text-muted-foreground"> / {fmtMarks(outOf)}</span>
          </div>
        </div>
      )}

      {questions.map((q, i) => {
        const a = byQ.get(q.id);
        const value = answers[q.id];
        const rubric = Array.isArray(a?.auto_rubric)
          ? (a!.auto_rubric as { id: string; present: boolean; why?: string }[])
          : null;

        return (
          <section key={q.id} className="rounded-lg border border-line bg-card p-4 sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <span>Question {i + 1}</span>
                  {q.is_bonus && <span className="rounded bg-muted px-1.5 py-0.5 normal-case">bonus</span>}
                  {q.is_task && <span className="rounded bg-muted px-1.5 py-0.5 normal-case">practical task</span>}
                  {!q.is_task && <span className="tabular-nums">{fmtMarks(q.points)} mark{q.points === 1 ? "" : "s"}</span>}
                </div>
                <MixedText text={q.prompt} variant="quran" className="mt-2 block text-[15px] leading-relaxed" />
              </div>
              {approved && !q.is_task && (
                <MarkBadge marks={a?.final_marks ?? null} points={q.points} />
              )}
            </div>

            <div className="mt-4">
              {q.is_task ? (
                <label className="flex items-start gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    disabled={readOnly}
                    checked={textOf(value) === "done"}
                    onChange={(e) => update(q.id, textResponse(e.target.checked ? "done" : ""))}
                    className="mt-0.5 size-4 accent-[var(--ink)]"
                  />
                  <span className="text-muted-foreground">
                    I&apos;ve completed this task and sent my recording.
                  </span>
                </label>
              ) : q.qtype === "mcq" && q.options ? (
                <ul className="space-y-1.5">
                  {q.options.map((o) => {
                    const checked = selectedOf(value).includes(o.position);
                    return (
                      <li key={o.position}>
                        <label className={cn(
                          "flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors",
                          checked ? "border-ink bg-muted" : "border-line hover:bg-muted/60",
                          readOnly && "cursor-default",
                        )}>
                          <input type="radio" name={q.id} disabled={readOnly} checked={checked}
                            onChange={() => update(q.id, mcqResponse(o.position))}
                            className="mt-0.5 size-4 accent-[var(--ink)]" />
                          <MixedText text={o.value ?? o.label} />
                        </label>
                      </li>
                    );
                  })}
                </ul>
              ) : q.qtype === "checkbox" && q.options ? (
                <ul className="space-y-1.5">
                  {q.options.map((o) => {
                    const sel = selectedOf(value);
                    const checked = sel.includes(o.position);
                    return (
                      <li key={o.position}>
                        <label className={cn(
                          "flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors",
                          checked ? "border-ink bg-muted" : "border-line hover:bg-muted/60",
                          readOnly && "cursor-default",
                        )}>
                          <input type="checkbox" disabled={readOnly} checked={checked}
                            onChange={(e) => update(q.id, checkboxResponse(
                              e.target.checked ? [...sel, o.position] : sel.filter((p) => p !== o.position),
                            ))}
                            className="mt-0.5 size-4 accent-[var(--ink)]" />
                          <MixedText text={o.value ?? o.label} />
                        </label>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Textarea
                  disabled={readOnly}
                  value={textOf(value)}
                  onChange={(e) => update(q.id, textResponse(e.target.value))}
                  rows={q.qtype === "paragraph" || q.qtype === "grid" ? 4 : 2}
                  placeholder="Answer in Arabic, transliteration or English — all are accepted."
                  className="font-arabic"
                />
              )}
            </div>

            {approved && rubric && (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {rubric.map((c) => (
                  <li key={c.id} className={cn(
                    "rounded-md px-2 py-1 text-xs",
                    c.present ? "bg-ok/12 text-ok" : "bg-danger/12 text-danger",
                  )}>
                    {c.present ? "✓" : "✗"} {c.why ?? c.id}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {!readOnly && submissionId && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-line bg-card p-4">
          <span className="text-xs text-muted-foreground">
            {saved === "saving" ? "Saving…" : saved === "saved" ? "Draft saved" : "Your work saves as you type."}
          </span>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await submitHomework(submissionId);
                router.refresh();
              })
            }
          >
            {pending ? "Submitting…" : "Submit homework"}
          </Button>
        </div>
      )}

      {readOnly && !approved && (
        <p className="rounded-lg border border-line bg-card p-4 text-sm text-muted-foreground">
          Submitted — your teacher will release your mark shortly.
        </p>
      )}
    </div>
  );
}
