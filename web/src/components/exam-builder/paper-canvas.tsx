"use client";

/**
 * The paper as it will print: a white sheet with last year's header
 * (centred title block, Max Marks and Duration on the right, numbered notes,
 * a rule), then its sections. Numbers restart in each section and every
 * total is worked out from what is on the sheet, so they change the moment
 * a question is added, moved or re-marked.
 */
import { Loader2, Pencil, Plus, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMarks, numberItems, paperTotal, sectionTotal } from "@/lib/exam-builder/numbering";
import type { Paper, Section, SectionKind } from "@/lib/exam-builder/types";
import { itemsIn, orderedSections, type Item, type PaperOps } from "./paper-state";
import { SectionBlock } from "./section-block";

export function PaperCanvas({
  paper, sections, items, ops, locked, showAnswers, flashId, addingSection = null,
}: {
  paper: Paper;
  sections: Section[];
  items: Item[];
  ops: PaperOps;
  locked: boolean;
  showAnswers: boolean;
  flashId: string | null;
  /** A section being added: its button shows it is waiting for the server. */
  addingSection?: SectionKind | null;
}) {
  const ordered = orderedSections(sections);
  const numbers = numberItems(ordered, items);
  const total = paperTotal(ordered, items);
  const hasPractical = ordered.some((s) => s.kind === "practical");

  return (
    <div className="exam-sheet mx-auto w-full max-w-[52rem] rounded-sm px-5 py-8 text-[15px] leading-relaxed shadow-[0_1px_3px_rgb(0_0_40/0.12),0_12px_32px_-12px_rgb(0_0_40/0.25)] ring-1 ring-black/5 sm:px-12 sm:py-12" data-testid="paper-sheet">
      <header className="group/head relative">
        {!locked && (
          <div className="font-sans absolute -top-4 right-0 sm:-top-6">
            <Button variant="outline" size="sm" className="bg-white" onClick={ops.editHeader}>
              <Pencil aria-hidden /> Edit title, date &amp; notes
            </Button>
          </div>
        )}
        <div className="pt-6 text-center sm:pt-4">
          <p className="text-lg font-bold">BSMS Tajweed</p>
          <p className="text-lg font-bold" data-testid="paper-title">{paper.title}</p>
          <p className="italic">{paper.date_label || <span className="font-sans text-sm text-muted-foreground not-italic">No date yet</span>}</p>
        </div>
        <div className="mt-3 text-right">
          <p><b>Max Marks:</b> <span className="tabular-nums" data-testid="paper-total">{formatMarks(total)}</span></p>
          <p><b>Duration:</b> {paper.duration_label || <span className="font-sans text-sm text-muted-foreground">not set</span>}</p>
        </div>
        {paper.notes.length > 0 && (
          <div className="mt-3">
            <p className="font-bold">Note:</p>
            <ol className="list-decimal space-y-0.5 pl-6">
              {paper.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ol>
          </div>
        )}
        <hr className="mt-5 border-t-2 border-[#00004d]" />
      </header>

      {ordered.length === 0 && (
        <p className="py-8 text-center font-sans text-sm text-muted-foreground">This paper has no sections. Add one below.</p>
      )}

      {ordered.map((s, i) => (
        <SectionBlock
          key={s.id}
          section={s}
          index={i}
          count={ordered.length}
          items={itemsIn(items, s.id)}
          numbers={numbers}
          total={sectionTotal(s, items)}
          sections={ordered}
          ops={ops}
          locked={locked}
          showAnswers={showAnswers}
          flashId={flashId}
        />
      ))}

      {!locked && (
        <div className="font-sans mt-10 flex flex-wrap items-center justify-center gap-2 border-t border-dashed border-line pt-6">
          <Button variant="outline" className="bg-white" onClick={() => ops.addSection("questions")} disabled={addingSection !== null}>
            {addingSection === "questions" ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
            {addingSection === "questions" ? "Adding a section…" : "Add a section"}
          </Button>
          <Button variant="outline" className="bg-white" onClick={() => ops.addSection("practical")} disabled={hasPractical || addingSection !== null} title={hasPractical ? "The paper already has the practical table" : undefined}>
            {addingSection === "practical" ? <Loader2 className="animate-spin" aria-hidden /> : <Table2 aria-hidden />}
            {addingSection === "practical" ? "Adding the table…" : "Add the practical (hifdh) table"}
          </Button>
        </div>
      )}
    </div>
  );
}
