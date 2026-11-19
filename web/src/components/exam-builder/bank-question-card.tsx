"use client";

/**
 * One question in the bank: its wording and pictures, the options with the
 * correct one marked, its marks, where it was found and which exams already
 * used it. In the builder it carries "Add to paper", which puts a copy in the
 * section that suits it (the multiple-choice section for a multiple choice),
 * with a menu to choose another. On the bank page it is read-only.
 */
import { memo } from "react";
import { AlertTriangle, Check, ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMarks } from "@/lib/exam-builder/numbering";
import type { BankQuestion } from "@/lib/exam-builder/types";
import { cn } from "@/lib/utils";
import { ActionItem, ActionMenu } from "./action-menu";
import { OptionList, QuestionPrompt } from "./question-prompt";

export type SectionChoice = { id: string; title: string };

const chip = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold whitespace-nowrap";

/** True when the question has nothing to mark against: no answer text and no correct option. */
export function lacksAnswer(q: Pick<BankQuestion, "answer" | "kind" | "options">): boolean {
  if (q.answer && q.answer.trim()) return false;
  if (q.kind === "mcq" && (q.options ?? []).some((o) => o.correct)) return false;
  return true;
}

function BankQuestionCardImpl({
  q,
  added = false,
  sections,
  suggestedId,
  onAdd,
  locked = false,
}: {
  q: BankQuestion;
  /** The paper already holds a copy. */
  added?: boolean;
  /** Question sections to offer; omit for the read-only bank page. */
  sections?: SectionChoice[];
  suggestedId?: string | null;
  onAdd?: (sectionId: string) => void;
  /** The paper is final: adding is off. */
  locked?: boolean;
}) {
  const canAdd = !!onAdd && !!sections?.length;
  const target = sections?.find((s) => s.id === suggestedId) ?? sections?.[0];
  const sources = q.sources.map((s) => (s.number ? `${s.label} (${s.number})` : s.label));

  return (
    <article
      className={cn(
        "grid gap-3 border border-line bg-card p-4 transition-colors",
        added && "bg-[color-mix(in_oklab,var(--ok)_6%,var(--card))]",
      )}
      aria-label={`Question: ${q.prompt.slice(0, 80)}`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={cn(chip, q.marks == null ? "bg-warn/15 text-warn" : "bg-brand/15 text-brand")}>
          {q.marks == null ? "No marks set" : `${formatMarks(q.marks)} ${q.marks === 1 ? "mark" : "marks"}`}
        </span>
        <span className={cn(chip, "bg-muted text-muted-foreground")}>
          {q.kind === "mcq" ? (q.select_many ? "Multiple choice · tick all" : "Multiple choice") : "Short answer"}
        </span>
        {q.review_status === "check" && (
          <span className={cn(chip, "bg-warn/15 text-warn")} title={q.review_note ?? undefined}>
            <AlertTriangle className="size-3" aria-hidden /> Needs checking
          </span>
        )}
        {lacksAnswer(q) && <span className={cn(chip, "bg-danger/15 text-danger")}>No answer yet</span>}
      </div>

      <div className="text-[0.95rem] leading-relaxed font-medium">
        <QuestionPrompt
          prompt={q.prompt}
          images={q.prompt_images}
          imageUrls={q.imageUrls}
          quran={q.prompt_quran}
          variant="screen"
        />
      </div>

      {q.kind === "mcq" && q.options && q.options.length > 0 && (
        <div className="text-sm">
          <OptionList options={q.options} imageUrls={q.imageUrls} showCorrect variant="screen" />
        </div>
      )}

      {(q.answer || (q.review_status === "check" && q.review_note)) && (
        <div className="grid gap-1.5">
          {q.answer && (
            <details className="group text-sm">
              <summary className="w-fit cursor-pointer rounded-sm text-xs font-medium text-brand underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                <span className="group-open:hidden">Show answer</span>
                <span className="hidden group-open:inline">Hide answer</span>
              </summary>
              <p className="mt-2 border-l-2 border-brand/40 pl-3 whitespace-pre-line text-muted-foreground">{q.answer}</p>
            </details>
          )}
          {q.review_status === "check" && q.review_note && (
            <details className="group text-sm">
              <summary className="w-fit cursor-pointer rounded-sm text-xs font-medium text-warn underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                Why it needs checking
              </summary>
              <p className="mt-2 border-l-2 border-warn/50 pl-3 text-muted-foreground">{q.review_note}</p>
            </details>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 border-t border-line pt-3">
        <div className="grid min-w-0 flex-1 gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {q.used_in.length > 0 ? (
              q.used_in.map((u) => (
                <span key={u} className={cn(chip, "bg-ok/15 text-ok")} title={`Used in the ${u} exam`}>
                  {u}
                </span>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">Not used before</span>
            )}
          </div>
          {sources.length > 0 && (
            <p className="text-[0.7rem] leading-snug text-muted-foreground">
              Found in {sources.join(" · ")}
            </p>
          )}
        </div>

        {canAdd && target && (
          added ? (
            <Button variant="outline" size="sm" disabled className="opacity-100 text-ok">
              <Check aria-hidden /> Added
            </Button>
          ) : (
            <div className="inline-flex shrink-0">
              <Button
                size="sm"
                className="rounded-r-none"
                disabled={locked}
                onClick={() => onAdd!(target.id)}
                title={`Adds it to ${target.title}`}
              >
                <Plus aria-hidden /> Add to paper
              </Button>
              <ActionMenu
                label="Add it to…"
                trigger={
                  <Button
                    size="icon-sm"
                    className="rounded-l-none border-l border-tertiary-foreground/20"
                    disabled={locked}
                    aria-label="Choose the section to add it to"
                  >
                    <ChevronDown aria-hidden />
                  </Button>
                }
              >
                {sections!.map((s) => (
                  <ActionItem key={s.id} onSelect={() => onAdd!(s.id)}>
                    <span className="min-w-0 flex-1 truncate">{s.title}</span>
                    {s.id === target.id && <span className="text-xs text-muted-foreground">suggested</span>}
                  </ActionItem>
                ))}
              </ActionMenu>
            </div>
          )
        )}
      </div>
    </article>
  );
}

/** Memoised: a rule can hold dozens, and the panel re-renders on every keystroke in the search box. */
export const BankQuestionCard = memo(BankQuestionCardImpl);
