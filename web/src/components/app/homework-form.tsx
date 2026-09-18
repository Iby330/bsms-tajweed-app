"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MixedText } from "@/components/app/mixed-text";
import { TapWords } from "@/components/app/tap-words";
import { isTapWords } from "@/lib/homework/tap-words";
import { MarkBadge } from "@/components/app/mark-badge";
import { VoiceRecorder } from "@/components/app/voice-recorder";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { saveAnswer, submitHomework } from "@/lib/homework/actions";
import {
  mcqResponse, checkboxResponse, textResponse,
  selectedOf, textOf, fmtMarks, missingTaskRecordings,
  type StudentQuestion,
} from "@/lib/homework/logic";
import { cn } from "@/lib/utils";

export type ExistingAnswer = {
  question_id: string;
  response: unknown;
  final_marks: number | null;
  auto_rubric: unknown;
  teacher_comment: string | null;
};

export type ExistingVoiceNote = {
  question_id: string;
  storage_path: string;
  duration_s: number | null;
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
  voiceNotes = [],
  attempt = 1,
  status,
  readOnly,
}: {
  submissionId: string | null;
  questions: StudentQuestion[];
  existing: ExistingAnswer[];
  voiceNotes?: ExistingVoiceNote[];
  attempt?: number;
  status: string | null;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const byQ = new Map(existing.map((a) => [a.question_id, a]));
  const voiceByQ = new Map(voiceNotes.map((v) => [v.question_id, v]));

  const [answers, setAnswers] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(existing.map((a) => [a.question_id, a.response])),
  );
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  // Which tasks have a recording, kept here rather than read back off the
  // server: a student records and hands in within the same page life, and the
  // button must unlock the moment the upload lands.
  const [recorded, setRecorded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(voiceNotes.map((v) => [v.question_id, true])),
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
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
  // The whole point of a task is that a teacher hears it, so an unrecorded one
  // holds the hand-in. `submitHomework` checks the same thing server-side.
  const missing = missingTaskRecordings(
    questions,
    Object.entries(recorded)
      .filter(([, has]) => has)
      .map(([question_id]) => ({ question_id })),
  );

  return (
    <div className="field">
      {approved && (
        <div className="box c12">
          <span className="label">Your mark</span>
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
          <section key={q.id} className="box c12">
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
                submissionId ? (
                  <VoiceRecorder
                    submissionId={submissionId}
                    questionId={q.id}
                    attempt={attempt}
                    initialPath={voiceByQ.get(q.id)?.storage_path ?? null}
                    initialDuration={voiceByQ.get(q.id)?.duration_s ?? null}
                    readOnly={readOnly}
                    onRecorded={(has) => setRecorded((r) => ({ ...r, [q.id]: has }))}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Open this homework to start recording.
                  </p>
                )
              ) : isTapWords(q.options) ? (
                /* A passage to tap rather than options to pick — the same
                   {selected:[…]} answer either way, so nothing downstream
                   knows the difference. */
                <TapWords
                  options={q.options!}
                  selected={selectedOf(value)}
                  readOnly={readOnly}
                  onChange={(next) => update(q.id, checkboxResponse(next))}
                />
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
                          <MixedText text={o.value ?? o.label} variant="quran" />
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
                          <MixedText text={o.value ?? o.label} variant="quran" />
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
                  placeholder="Answer in Arabic, transliteration or English. All are accepted."
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

            {/* The teacher's own words, released with the mark. Set alongside
                the rubric chips because those are the model's reading of the
                answer and this is a person's — same place, different voice.
                Through MixedText: comments carry Arabic. */}
            {approved && a?.teacher_comment && (
              <div className="mt-3">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  From your teacher
                </div>
                <MixedText
                  text={a.teacher_comment}
                  className="mt-1 block break-words rounded-md bg-muted px-2.5 py-1.5 text-xs text-ink-2"
                />
              </div>
            )}
          </section>
        );
      })}

      {!readOnly && submissionId && (
        <div className="box c12" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <span className="text-xs text-muted-foreground">
            {saved === "saving"
              ? "Saving…"
              : saved === "saved"
                ? "Draft saved"
                : missing.length > 0
                  ? "Record every task before you hand in."
                  : "Your work saves as you type."}
          </span>
          <div className="flex flex-col items-end gap-1">
            <Button
              disabled={pending || missing.length > 0}
              onClick={() =>
                startTransition(async () => {
                  setSubmitError(null);
                  try {
                    await submitHomework(submissionId);
                    router.refresh();
                  } catch (e) {
                    // The server refuses a hand-in with a task unrecorded — a
                    // second tab, or a recording deleted elsewhere. Saying so
                    // beats a button that silently does nothing.
                    setSubmitError(
                      e instanceof Error ? e.message : "Could not hand in. Try again.",
                    );
                  }
                })
              }
            >
              {pending ? "Submitting…" : "Submit homework"}
            </Button>
            {submitError && <p className="text-xs text-danger">{submitError}</p>}
          </div>
        </div>
      )}

      {readOnly && !approved && (
        <p className="empty">
          Submitted. Your teacher will release your mark shortly.
        </p>
      )}
    </div>
  );
}
