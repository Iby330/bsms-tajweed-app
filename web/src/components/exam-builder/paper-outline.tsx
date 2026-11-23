"use client";

/**
 * The paper's outline, on the right of the builder: the front page, then
 * every section with its questions and marks, and the paper's marks so far.
 * A row takes the paper to that section; a question section's + opens the
 * "Add a question" drawer for it. The practical table shows its marks only.
 *
 * `strip` is the thin version for when the drawer is open on a narrower
 * screen: a letter and marks per section, so the paper keeps its width.
 */
import { AlertTriangle, FileText, Plus } from "lucide-react";
import { sectionLetter } from "@/lib/exam-builder/drawer";
import { formatMarks, paperTotal, sectionTotal } from "@/lib/exam-builder/numbering";
import type { Section } from "@/lib/exam-builder/types";
import { cn } from "@/lib/utils";
import { itemsIn, type Item } from "./paper-state";

export type OutlineProps = {
  /** In paper order. */
  sections: Section[];
  items: Item[];
  /** Bank question ids that have no marks in the bank: their copies were given 1 mark. */
  marklessIds: Set<string>;
  /** The section the drawer is adding to. */
  targetId: string | null;
  locked: boolean;
  /** Take the paper to a section, or to the front page. */
  onJump: (sectionId: string | null) => void;
  onAdd: (sectionId: string) => void;
  /** Off where the outline already sits under its own title (the phone sheet). */
  heading?: boolean;
};

const plural = (n: number, one: string, many: string) => `${formatMarks(n)} ${n === 1 ? one : many}`;

/** Questions still on the default mark because the bank had none for them. */
function guessedMarks(items: Item[], marklessIds: Set<string>): number {
  return items.filter((i) => i.bank_question_id && marklessIds.has(i.bank_question_id) && i.marks === 1).length;
}

export function PaperOutline({ sections, items, marklessIds, targetId, locked, onJump, onAdd, heading = true }: OutlineProps) {
  const total = paperTotal(sections, items);
  const count = items.filter((i) => !i.id.startsWith("temp-")).length;
  return (
    <nav aria-label="Outline of the paper" className="grid gap-2">
      {heading && <h2 className="px-0.5 text-[0.7rem] font-bold tracking-[0.12em] text-muted-foreground uppercase">Outline</h2>}
      <button
        type="button"
        onClick={() => onJump(null)}
        className="grid gap-0.5 rounded-lg border border-line bg-card px-3 py-2 text-left outline-none hover:border-brand/50 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="text-sm font-semibold">Front page</span>
        <span className="text-xs text-muted-foreground">Title, Max Marks, Duration, Notes</span>
      </button>

      {sections.map((s) => {
        const own = itemsIn(items, s.id);
        const marks = sectionTotal(s, items);
        const practical = s.kind === "practical";
        const guessed = practical ? 0 : guessedMarks(own, marklessIds);
        const on = targetId === s.id;
        return (
          <div
            key={s.id}
            className={cn(
              "relative rounded-lg border bg-card transition-colors",
              on ? "border-brand/70 bg-[color-mix(in_oklab,var(--brand)_10%,var(--card))] shadow-[inset_-3px_0_0_var(--brand)]" : "border-line hover:border-brand/50",
            )}
          >
            <button
              type="button"
              onClick={() => onJump(s.id)}
              className={cn(
                "grid w-full gap-0.5 rounded-lg px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
                !practical && !locked && "pr-12 max-lg:pr-16",
              )}
            >
              <span className="line-clamp-2 text-sm font-semibold">{s.title}</span>
              <span className="text-xs text-muted-foreground">
                {practical
                  ? `Hifdh table · ${plural(marks, "mark", "marks")}`
                  : `${own.length} ${own.length === 1 ? "question" : "questions"} · ${plural(marks, "mark", "marks")}`}
              </span>
              {guessed > 0 && (
                <span className="flex items-start gap-1 text-xs font-semibold text-warn">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
                  {guessed} without marks in the bank, set to 1
                </span>
              )}
            </button>
            {!practical && !locked && (
              <button
                type="button"
                onClick={() => onAdd(s.id)}
                aria-label={`Add a question to ${s.title}`}
                title="Add a question"
                className="absolute top-2 right-2 grid size-8 cursor-pointer max-lg:size-11 place-items-center rounded-md border border-line bg-card text-brand outline-none hover:border-brand/60 hover:bg-[color-mix(in_oklab,var(--brand)_10%,var(--card))] focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Plus className="size-4" aria-hidden />
              </button>
            )}
          </div>
        );
      })}

      <div className="mt-2 grid gap-0.5 border-t border-line px-0.5 pt-3">
        <span className="text-[0.7rem] font-bold tracking-[0.12em] text-muted-foreground uppercase">Marks so far</span>
        <span className="text-2xl font-bold tabular-nums" data-testid="outline-total">{formatMarks(total)}</span>
        <span className="text-xs text-muted-foreground">
          {count} {count === 1 ? "question" : "questions"}{sections.some((s) => s.kind === "practical") ? " and the hifdh table" : ""}
        </span>
      </div>
    </nav>
  );
}

/** The thin outline: a letter and marks per section. */
export function OutlineStrip({ sections, items, targetId, onJump }: Pick<OutlineProps, "sections" | "items" | "targetId" | "onJump">) {
  const total = paperTotal(sections, items);
  return (
    <nav aria-label="Outline of the paper" className="grid justify-items-stretch gap-1.5">
      <button
        type="button"
        onClick={() => onJump(null)}
        aria-label="Front page"
        title="Front page"
        className="grid h-10 place-items-center rounded-lg border border-line bg-card text-muted-foreground outline-none hover:border-brand/50 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <FileText className="size-4" aria-hidden />
      </button>
      {sections.map((s, i) => {
        const marks = sectionTotal(s, items);
        const on = targetId === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onJump(s.id)}
            aria-label={`${s.title}, ${plural(marks, "mark", "marks")}`}
            title={s.title}
            className={cn(
              "grid place-items-center gap-0 rounded-lg border bg-card py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring",
              on ? "border-brand/70 bg-[color-mix(in_oklab,var(--brand)_10%,var(--card))]" : "border-line hover:border-brand/50",
            )}
          >
            <span className="text-base leading-tight font-bold">{sectionLetter(s.title, i)}</span>
            <span className="text-[0.7rem] text-muted-foreground tabular-nums">{formatMarks(marks)}</span>
          </button>
        );
      })}
      <div className="mt-1 grid place-items-center border-t border-line pt-2" title="Marks so far">
        <span className="text-[0.6rem] font-bold tracking-[0.08em] text-muted-foreground uppercase">Total</span>
        <span className="text-sm font-bold tabular-nums">{formatMarks(total)}</span>
      </div>
    </nav>
  );
}
