"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MixedText } from "@/components/app/mixed-text";
import { TapWords } from "@/components/app/tap-words";
import { isTapWords } from "@/lib/homework/tap-words";
import { MarkBadge } from "@/components/app/mark-badge";
import { VoiceRecorder } from "@/components/app/voice-recorder";
import { RecitationClip } from "@/components/app/recitation-clip";
import { LetterGrid, LetterSteps } from "@/components/app/letter-grid";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { saveAnswer, submitHomework } from "@/lib/homework/actions";
import { STALE_PAGE, whyActionFailed } from "@/lib/homework/stale-page";
import { createSaveQueue, type SaveStatus } from "@/lib/homework/save-queue";
import {
  mcqResponse, checkboxResponse, textResponse,
  selectedOf, textOf, fmtMarks, missingTaskRecordings,
  type StudentQuestion,
} from "@/lib/homework/logic";
import { parseMedia } from "@/lib/homework/media";
import { blocksOf, isLetterGrid } from "@/lib/homework/letters";
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
  const [saved, setSaved] = useState<"idle" | "saved">("idle");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ inFlight: 0, queued: 0, error: null });
  // Which tasks have a recording, kept here rather than read back off the
  // server: a student records and hands in within the same page life, and the
  // button must unlock the moment the upload lands.
  const [recorded, setRecorded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(voiceNotes.map((v) => [v.question_id, true])),
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Set when an action threw on a working connection: the page has outlived
  // its deploy (lib/homework/stale-page.ts), and only a reload mends it.
  const [stale, setStale] = useState(false);
  // One queue for the page's life: the hand-in has to flush and wait on the
  // same timers and saves the typing started.
  const [queue] = useState(() =>
    createSaveQueue<unknown>({
      save: async (questionId, response) => {
        if (!submissionId) return;
        // A throw (the network, a page older than the deploy, or a server
        // fault whose message production hides) becomes a sentence a student
        // can act on.
        const { error } = await saveAnswer(submissionId, questionId, response).catch(async () => {
          if ((await whyActionFailed()) === "updated") {
            setStale(true);
            return { error: STALE_PAGE };
          }
          return { error: "Check your connection and try again." };
        });
        if (error) throw new Error(error);
        setSaved("saved");
      },
      onStatus: setSaveStatus,
    }),
  );

  useEffect(() => () => queue.cancel(), [queue]);

  function update(questionId: string, response: unknown) {
    setAnswers((a) => ({ ...a, [questionId]: response }));
    if (!submissionId || readOnly) return;
    queue.schedule(questionId, response);
  }

  const saving = saveStatus.inFlight > 0 || saveStatus.queued > 0;

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

  function renderQuestion(q: StudentQuestion, label: string) {
    const a = byQ.get(q.id);
    const value = answers[q.id];
    // Parsed per question, and forgivingly: audio that does not parse is
    // simply absent, and the question reads as it would without it.
    const media = parseMedia(q.media);
    const rubric = Array.isArray(a?.auto_rubric)
      ? (a!.auto_rubric as { id: string; present: boolean; why?: string }[])
      : null;

    return (
      <section key={q.id} className="box c12 qn">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
              <span>Question {label}</span>
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

        {/* "Name the rule you heard": the listening sits between the
            question and the answers, where it is read, so the student
            hears it before choosing and can replay it while they do. */}
        {media.clip && <RecitationClip clip={media.clip} className="mt-4" />}

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
          ) : q.qtype === "mcq" && q.options && isLetterGrid(q.options) ? (
            /* A letter on its own (a run of them is LetterSteps): the
               alphabet as tiles, not 29 rows. */
            <LetterGrid
              options={q.options}
              selected={selectedOf(value)[0] ?? null}
              readOnly={readOnly}
              onChange={(p) => update(q.id, mcqResponse(p))}
              label={`Letters for question ${label}`}
            />
          ) : q.qtype === "mcq" && q.options ? (
            <ul className="space-y-1.5">
              {q.options.map((o, idx) => {
                const checked = selectedOf(value).includes(o.position);
                const audio = media.optionAudio[o.position];
                return (
                  <li key={o.position} className={cn(audio && "flex items-center gap-2")}>
                    <label className={cn(
                      "flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors",
                      checked ? "border-ink bg-muted" : "border-line hover:bg-muted/60",
                      readOnly && "cursor-default",
                      audio && "min-w-0 flex-1",
                    )}>
                      <input type="radio" name={q.id} disabled={readOnly} checked={checked}
                        onChange={() => update(q.id, mcqResponse(o.position))}
                        className="mt-0.5 size-4 accent-[var(--ink)]" />
                      <MixedText text={o.value ?? o.label} variant="quran" />
                    </label>
                    {/* Beside the label, never inside it: a click inside
                        a label is a click on its radio, and hearing an
                        option must not choose it. */}
                    {audio && <RecitationClip clip={audio} compact name={`option ${idx + 1}`} />}
                  </li>
                );
              })}
            </ul>
          ) : q.qtype === "checkbox" && q.options ? (
            <ul className="space-y-1.5">
              {q.options.map((o, idx) => {
                const sel = selectedOf(value);
                const checked = sel.includes(o.position);
                const audio = media.optionAudio[o.position];
                return (
                  <li key={o.position} className={cn(audio && "flex items-center gap-2")}>
                    <label className={cn(
                      "flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors",
                      checked ? "border-ink bg-muted" : "border-line hover:bg-muted/60",
                      readOnly && "cursor-default",
                      audio && "min-w-0 flex-1",
                    )}>
                      <input type="checkbox" disabled={readOnly} checked={checked}
                        onChange={(e) => update(q.id, checkboxResponse(
                          e.target.checked ? [...sel, o.position] : sel.filter((p) => p !== o.position),
                        ))}
                        className="mt-0.5 size-4 accent-[var(--ink)]" />
                      <MixedText text={o.value ?? o.label} variant="quran" />
                    </label>
                    {audio && <RecitationClip clip={audio} compact name={`option ${idx + 1}`} />}
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
  }

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

      {blocksOf(questions).map((b) =>
        b.kind === "steps" ? (
          <LetterSteps
            key={b.qs[0].id}
            parts={b.qs}
            number={b.number}
            selectedOf={(q) => selectedOf(answers[q.id])[0] ?? null}
            onChoose={(q, p) => update(q.id, mcqResponse(p))}
            readOnly={readOnly}
            approved={approved}
            answerOf={(q) => byQ.get(q.id)}
          />
        ) : (
          renderQuestion(b.q, String(b.number))
        ),
      )}

      {!readOnly && submissionId && (
        // `submitbar`: on a phone this row rides above the tab bar while the
        // questions scroll, so handing in is never a scroll to the bottom away.
        <div className="box c12 submitbar" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <span className={cn("text-xs", saveStatus.error && !saving ? "text-danger" : "text-muted-foreground")}>
            {saving
              ? "Saving…"
              : saveStatus.error
                ? `Not saved: ${saveStatus.error}`
                : saved === "saved"
                  ? "Draft saved"
                  : missing.length > 0
                    ? "Record every task before you hand in."
                    : "Your work saves as you type."}
          </span>
          <div className="flex flex-col items-end gap-1">
            <Button
              // Held while a save is on its way; a click during the typing
              // pause is fine, because the hand-in flushes that save first.
              disabled={pending || saveStatus.inFlight > 0 || missing.length > 0}
              onClick={() =>
                startTransition(async () => {
                  setSubmitError(null);
                  try {
                    // Every answer lands before the hand-in does, or the last
                    // one typed is dropped as a save onto handed-in work.
                    await queue.flush();
                  } catch (e) {
                    setSubmitError(
                      `Not handed in: an answer is not saved. ${e instanceof Error ? e.message : ""}`.trim(),
                    );
                    return;
                  }
                  try {
                    const { error } = await submitHomework(submissionId);
                    // The server refuses a hand-in with a task unrecorded — a
                    // second tab, or a recording deleted elsewhere. Saying so
                    // beats a button that silently does nothing.
                    if (error) {
                      setSubmitError(error);
                      return;
                    }
                    router.refresh();
                  } catch {
                    // The network, a page older than the deploy, or a fault
                    // the server could not word (production hides its message).
                    if ((await whyActionFailed()) === "updated") {
                      setStale(true);
                      setSubmitError(STALE_PAGE);
                    } else {
                      setSubmitError("Could not hand in. Check your connection and try again.");
                    }
                  }
                })
              }
            >
              {pending ? "Submitting…" : "Submit homework"}
            </Button>
            {submitError && <p className="text-xs text-danger">{submitError}</p>}
            {stale && (
              <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                Reload page
              </Button>
            )}
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
