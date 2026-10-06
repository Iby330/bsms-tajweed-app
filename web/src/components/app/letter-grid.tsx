"use client";

import { useRef, useState, type ReactNode } from "react";
import { MixedText } from "@/components/app/mixed-text";
import { MarkBadge } from "@/components/app/mark-badge";
import { RecitationClip } from "@/components/app/recitation-clip";
import { Button } from "@/components/ui/button";
import { parseMedia } from "@/lib/homework/media";
import { partLetter } from "@/lib/homework/letters";
import { fmtMarks, type StudentQuestion } from "@/lib/homework/logic";
import { cn } from "@/lib/utils";

/** The app's Arabic UI face, not the Qur'an's. A letter chart shows each
 *  letter as it is taught, and the mushaf faces draw a lone yā' the way the
 *  mushaf ends a word, without its dots, where it reads as alif maqṣūrah. */
const LETTER_FACE = "var(--font-arabic), sans-serif";

type GridOption = { position: number; label: string; value?: string | null; correct?: boolean };

/**
 * The whole alphabet as tiles, read right to left, one to choose. Each tile is
 * a real button with the letter's position as its answer, so the answer is the
 * same {selected:[position]} an mcq radio list gives, and nothing downstream
 * knows the difference.
 *
 * `reveal` is the teacher's view: the key's letter is outlined in the pass
 * colour, and a wrong choice in the fail colour. The student RPC strips
 * `correct`, so a student never sees it.
 */
export function LetterGrid({
  options,
  selected,
  onChange,
  readOnly = false,
  reveal = false,
  label,
}: {
  options: GridOption[];
  selected: number | null;
  onChange?: (position: number) => void;
  readOnly?: boolean;
  reveal?: boolean;
  /** Names the group for a screen reader, e.g. "Letters for question 7c". */
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      dir="rtl"
      className="grid gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(2.75rem,1fr))]"
    >
      {options.map((o) => {
        const letter = (o.value ?? o.label).trim();
        const on = selected === o.position;
        const key = reveal && o.correct;
        const wrong = reveal && on && !o.correct;
        return (
          <button
            key={o.position}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={letter}
            disabled={readOnly}
            onClick={() => onChange?.(o.position)}
            style={{ fontFamily: LETTER_FACE }}
            className={cn(
              "grid aspect-square place-items-center rounded-md border pb-1 text-[1.6rem] leading-none transition-colors",
              "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              on ? "border-brand bg-muted shadow-[inset_0_0_0_1px_var(--brand)]" : "border-line bg-background",
              !readOnly && !on && "cursor-pointer hover:bg-muted/60",
              readOnly && "cursor-default disabled:opacity-100",
              key && "border-ok bg-ok/12 text-ok shadow-[inset_0_0_0_1px_var(--ok)]",
              wrong && "border-danger bg-danger/12 text-danger shadow-[inset_0_0_0_1px_var(--danger)]",
            )}
          >
            {letter}
          </button>
        );
      })}
    </div>
  );
}

export type StepAnswer = {
  final_marks: number | null;
  teacher_comment: string | null;
};

/**
 * A run of letter questions (7a … 7j) as ONE question shown a part at a time:
 * play, tap a letter, Next. Ten copies of the same card one under another made
 * the paper four screens longer and asked the same thing ten times.
 *
 * WHY EVERY PART IS RENDERED. All parts sit stacked in one grid cell and only
 * the current one is visible, so the card is always as tall as its tallest
 * part and Back / Next never move under the student's thumb when a part has a
 * teacher's comment and the next has none. The hidden parts are `inert`: not
 * focusable, not read out, not clickable.
 */
export function LetterSteps({
  parts,
  number,
  selectedOf,
  onChoose,
  readOnly,
  approved,
  answerOf,
}: {
  parts: StudentQuestion[];
  number: number;
  /** The position a part's answer has chosen, or null. */
  selectedOf: (q: StudentQuestion) => number | null;
  onChoose: (q: StudentQuestion, position: number) => void;
  readOnly: boolean;
  approved: boolean;
  answerOf: (q: StudentQuestion) => StepAnswer | undefined;
}) {
  const [at, setAt] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);
  const points = parts.reduce((s, q) => s + q.points, 0);
  const each = parts.every((q) => q.points === parts[0].points) ? parts[0].points : null;
  const answered = parts.filter((q) => selectedOf(q) !== null).length;
  const last = at === parts.length - 1;

  const part = (q: StudentQuestion, k: number): ReactNode => {
    const media = parseMedia(q.media);
    const a = answerOf(q);
    const name = `${number}${partLetter(k)}`;
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          {media.clip ? (
            <RecitationClip clip={media.clip} name={`question ${name}`} />
          ) : (
            <span className="text-sm text-muted-foreground">No recording for this part.</span>
          )}
          {approved && <MarkBadge marks={a?.final_marks ?? null} points={q.points} />}
        </div>
        <LetterGrid
          options={q.options ?? []}
          selected={selectedOf(q)}
          readOnly={readOnly}
          onChange={(p) => onChoose(q, p)}
          label={`Letters for question ${name}`}
        />
        {approved && a?.teacher_comment && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">From your teacher</div>
            <MixedText
              text={a.teacher_comment}
              className="mt-1 block break-words rounded-md bg-muted px-2.5 py-1.5 text-xs text-ink-2"
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <section ref={sectionRef} className="box c12 qn">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          <span>Question {number}</span>
          <span className="tabular-nums">{fmtMarks(points)} mark{points === 1 ? "" : "s"}</span>
          {each !== null && (
            <span className="rounded bg-muted px-1.5 py-0.5 normal-case tracking-normal">
              {fmtMarks(each)} mark{each === 1 ? "" : "s"} per letter
            </span>
          )}
        </div>
        <MixedText text={parts[0].prompt} variant="quran" className="mt-2 block text-[15px] leading-relaxed" />
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <span className="font-mono text-xs tracking-wide text-ink-2 tabular-nums" aria-live="polite">
          {number}{partLetter(at)} · {at + 1} of {parts.length}
        </span>
        {/* One row however many parts, each square an equal share of it, so
            a phone never strands the last part on a line of its own. */}
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${parts.length}, minmax(0, 1fr))` }}
          role="group"
          aria-label={`Parts of question ${number}`}
        >
          {parts.map((q, k) => {
            const done = selectedOf(q) !== null;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => setAt(k)}
                aria-label={`Question ${number}${partLetter(k)}${done ? ", answered" : ""}`}
                aria-current={k === at ? "step" : undefined}
                className={cn(
                  "grid h-8 place-items-center rounded-md border font-mono text-[11px] transition-colors",
                  done ? "border-muted bg-muted text-foreground" : "border-line text-ink-3",
                  k === at && "border-brand text-foreground shadow-[inset_0_0_0_1px_var(--brand)]",
                )}
              >
                {partLetter(k)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 grid">
        {parts.map((q, k) => (
          <div
            key={q.id}
            inert={k !== at}
            aria-hidden={k !== at}
            className={cn(
              "[grid-area:1/1] motion-safe:transition-opacity motion-safe:duration-200",
              k === at ? "opacity-100" : "invisible opacity-0",
            )}
          >
            {part(q, k)}
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
        <Button type="button" variant="outline" disabled={at === 0} onClick={() => setAt(at - 1)}>
          ← Back
        </Button>
        <span className="flex-1 text-center text-xs text-muted-foreground tabular-nums max-[380px]:hidden">
          {answered === parts.length ? `All ${parts.length} answered` : `${answered} of ${parts.length} answered`}
        </span>
        {/* On the last part, Finish moves the student on to whatever comes
            after this question (the next one, or the hand-in bar). */}
        <Button
          type="button"
          className="min-w-24"
          onClick={() => {
            if (!last) setAt(at + 1);
            else sectionRef.current?.nextElementSibling?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        >
          {last ? "Finish" : "Next →"}
        </Button>
      </div>
    </section>
  );
}
