"use client";

/**
 * One section of the paper: its title (renamed in place) with its total, its
 * numbered questions or — for the practical section — the hifdh table, and
 * the controls to move or remove it. Each question has a small toolbar that
 * appears on hover or focus (always shown on touch screens).
 */
import { useState } from "react";
import {
  ArrowDown, ArrowUp, FolderInput, Pencil, Plus, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMarks, marksLabel } from "@/lib/exam-builder/numbering";
import type { Section } from "@/lib/exam-builder/types";
import { cn } from "@/lib/utils";
import { ActionItem, ActionMenu } from "./action-menu";
import { ConfirmDialog } from "./confirm-dialog";
import type { Item, PaperOps } from "./paper-state";
import { OptionList, QuestionPrompt } from "./question-prompt";

const isTemp = (id: string) => id.startsWith("temp-");

function SectionTitle({ section, total, locked, onRename }: {
  section: Section; total: number; locked: boolean; onRename: (title: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? section.title;
  const commit = () => {
    if (draft === null) return;
    const t = draft.trim();
    setDraft(null);
    if (t && t !== section.title) onRename(t);
  };
  return (
    <div className="flex min-w-0 flex-1 basis-full flex-wrap items-baseline gap-x-2 sm:basis-auto">
      {locked ? (
        <h2 className="min-w-0 text-[1.05rem] font-bold [font-family:inherit]">{section.title}</h2>
      ) : (
        <textarea
          value={value}
          rows={1}
          aria-label="Section title"
          title="Click to rename"
          data-section-title={section.id}
          onChange={(e) => setDraft(e.target.value.replace(/\n/g, " "))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
            if (e.key === "Escape") { setDraft(null); e.currentTarget.blur(); }
          }}
          className="field-sizing-content min-w-[12ch] flex-1 resize-none rounded-md border border-transparent bg-transparent px-1.5 py-0.5 -ml-1.5 text-[1.05rem] font-bold text-foreground outline-none [font-family:inherit] hover:border-foreground/25 focus:border-ring focus:bg-white focus:ring-2 focus:ring-ring/40"
        />
      )}
      <span className="shrink-0 font-bold tabular-nums">({formatMarks(total)} {total === 1 ? "mark" : "marks"})</span>
    </div>
  );
}

function ItemRow({
  item, number, sections, ops, locked, showAnswers, flash,
}: {
  item: Item; number: number; sections: Section[]; ops: PaperOps; locked: boolean;
  showAnswers: boolean; flash: boolean;
}) {
  const temp = isTemp(item.id);
  const others = sections.filter((s) => s.kind === "questions" && s.id !== item.section_id);
  const lines = item.kind === "short" ? item.answer_lines : 0;
  const shown = Math.min(lines, 3);
  const label = `question ${number}`;

  return (
    <li
      id={`item-${item.id}`}
      className={cn(
        "group/item relative -mx-3 rounded-md px-3 py-3 transition-colors hover:bg-[#2f4fd0]/[0.04] focus-within:bg-[#2f4fd0]/[0.04]",
        flash && "exam-flash",
        temp && "opacity-60",
      )}
    >
      <div className="flex items-start gap-2">
        <span className="w-7 shrink-0 font-bold tabular-nums">{number}.</span>
        <div className="min-w-0 flex-1 font-bold">
          <QuestionPrompt prompt={item.prompt} images={item.prompt_images} imageUrls={item.imageUrls} quran={item.prompt_quran} variant="screen" />
        </div>
        <span className="shrink-0 pl-2 tabular-nums">{marksLabel(item.marks)}</span>
      </div>

      {item.kind === "mcq" && item.options && item.options.length > 0 && (
        <div className="mt-2 pl-9">
          {item.select_many && <p className="mb-1 text-sm italic">(Select all that apply)</p>}
          <OptionList options={item.options} imageUrls={item.imageUrls} showCorrect={showAnswers} variant="screen" />
        </div>
      )}

      {lines > 0 && (
        <div className="mt-2 pl-9" aria-label={`${lines} writing lines`}>
          {Array.from({ length: shown }, (_, i) => (
            <div key={i} className="h-6 border-b border-dotted border-[#00004d]/40" />
          ))}
          {lines > shown && (
            <p className="mt-1 font-sans text-[0.7rem] text-muted-foreground">{lines} writing lines in all</p>
          )}
        </div>
      )}

      {showAnswers && (
        <div className="mt-2 ml-9 rounded border border-[#00004d]/30 px-3 py-2 text-sm">
          <span className="font-sans text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase">Answer</span>
          <p className="whitespace-pre-line">{item.answer || <em className="text-danger">Answer needed</em>}</p>
        </div>
      )}

      {!locked && !temp && (
        <div
          className={cn(
            "font-sans z-10 flex items-center gap-0.5 rounded-lg border border-line bg-card p-0.5 shadow-sm transition-opacity",
            "absolute -top-4 right-2 opacity-0 group-hover/item:opacity-100 group-focus-within/item:opacity-100",
            "[@media(hover:none)]:static [@media(hover:none)]:mt-2 [@media(hover:none)]:ml-9 [@media(hover:none)]:w-fit [@media(hover:none)]:opacity-100",
          )}
        >
          <Button variant="ghost" size="sm" onClick={() => ops.editItem(item.id)} aria-label={`Edit ${label}`}>
            <Pencil aria-hidden /> Edit
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => ops.moveItem(item.id, "up")} aria-label={`Move ${label} up`} title="Move up">
            <ArrowUp aria-hidden />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => ops.moveItem(item.id, "down")} aria-label={`Move ${label} down`} title="Move down">
            <ArrowDown aria-hidden />
          </Button>
          {others.length > 0 && (
            <ActionMenu
              label="Move it to…"
              trigger={
                <Button variant="ghost" size="icon-sm" aria-label={`Move ${label} to another section`} title="Move to another section">
                  <FolderInput aria-hidden />
                </Button>
              }
            >
              {others.map((s) => (
                <ActionItem key={s.id} onSelect={() => ops.moveItemToSection(item.id, s.id)}>
                  <span className="min-w-0 flex-1 truncate">{s.title}</span>
                </ActionItem>
              ))}
            </ActionMenu>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className="hover:text-danger"
            onClick={() => ops.removeItem(item.id)}
            aria-label={`Remove ${label} from the paper`}
            title="Remove from the paper"
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      )}
    </li>
  );
}

function PracticalTable({ section, locked, ops }: { section: Section; locked: boolean; ops: PaperOps }) {
  const p = section.practical ?? { rows: 3, marks: 9, columns: ["Verse", "Surah", "Order - before/after"] };
  const [rows, setRows] = useState(String(p.rows));
  const [marks, setMarks] = useState(String(p.marks));
  const [cols, setCols] = useState(p.columns.join(", "));
  const save = () => {
    const r = Number(rows), m = Number(marks);
    if (!Number.isInteger(r) || r < 1 || r > 30) { setRows(String(p.rows)); return; }
    if (!Number.isFinite(m) || m < 0 || !Number.isInteger(m * 2)) { setMarks(String(p.marks)); return; }
    const c = cols.split(",").map((x) => x.trim()).filter(Boolean);
    if (c.length < 1 || c.length > 6 || c.some((x) => x.length > 60)) { setCols(p.columns.join(", ")); return; }
    if (r !== p.rows || m !== p.marks || c.join("\u0000") !== p.columns.join("\u0000")) {
      ops.updatePractical(section.id, { rows: r, marks: m, columns: c });
    }
  };
  return (
    <div className="grid gap-3 py-3">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-10 border border-[#00004d]/50 px-2 py-1.5" aria-label="Row" />
              {p.columns.map((c, ci) => <th key={ci} className="border border-[#00004d]/50 px-2 py-1.5 text-left font-bold">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: p.rows }, (_, i) => (
              <tr key={i}>
                <td className="border border-[#00004d]/50 px-2 py-3 text-center tabular-nums">{i + 1}</td>
                {p.columns.map((_, ci) => <td key={ci} className="border border-[#00004d]/50" />)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!locked && (
        <div className="flex flex-wrap items-center gap-4 font-sans text-sm">
          <label className="flex items-center gap-2 text-muted-foreground">
            Rows
            <input type="number" min={1} max={30} step={1} value={rows} onChange={(e) => setRows(e.target.value)} onBlur={save}
              className="h-8 w-16 rounded-md border border-input bg-white px-2 text-right text-foreground tabular-nums outline-none focus:ring-2 focus:ring-ring/50" />
          </label>
          <label className="flex items-center gap-2 text-muted-foreground">
            Marks for the table
            <input type="number" min={0} max={100} step={0.5} value={marks} onChange={(e) => setMarks(e.target.value)} onBlur={save}
              className="h-8 w-20 rounded-md border border-input bg-white px-2 text-right text-foreground tabular-nums outline-none focus:ring-2 focus:ring-ring/50" />
          </label>
          <label className="flex min-w-0 basis-full items-center gap-2 text-muted-foreground">
            <span className="shrink-0">Column headings</span>
            <input type="text" value={cols} onChange={(e) => setCols(e.target.value)} onBlur={save}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              aria-describedby={`cols-hint-${section.id}`}
              className="h-8 min-w-0 flex-1 rounded-md border border-input bg-white px-2 text-foreground outline-none focus:ring-2 focus:ring-ring/50" />
          </label>
          <p id={`cols-hint-${section.id}`} className="-mt-2 basis-full text-xs text-muted-foreground">Separate the headings with commas, up to six.</p>
        </div>
      )}
    </div>
  );
}

export function SectionBlock({
  section, index, count, items, numbers, total, sections, ops, locked, showAnswers, flashId,
}: {
  section: Section;
  index: number;
  count: number;
  items: Item[];
  numbers: Record<string, number>;
  total: number;
  sections: Section[];
  ops: PaperOps;
  locked: boolean;
  showAnswers: boolean;
  flashId: string | null;
}) {
  const [confirm, setConfirm] = useState(false);
  const practical = section.kind === "practical";

  return (
    <section className="mt-6" aria-label={section.title}>
      <div className="-mx-3 flex flex-wrap items-center gap-2 rounded-md bg-[color-mix(in_oklab,var(--brand)_28%,var(--card))] px-3 py-2">
        <SectionTitle section={section} total={total} locked={locked} onRename={(t) => ops.renameSection(section.id, t)} />
        {!locked && (
          <div className="font-sans ml-auto flex shrink-0 items-center gap-0.5">
            <Button variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => ops.moveSection(section.id, "up")} aria-label={`Move ${section.title} up`} title="Move section up">
              <ArrowUp aria-hidden />
            </Button>
            <Button variant="ghost" size="icon-sm" disabled={index === count - 1} onClick={() => ops.moveSection(section.id, "down")} aria-label={`Move ${section.title} down`} title="Move section down">
              <ArrowDown aria-hidden />
            </Button>
            <Button
              variant="ghost" size="icon-sm" className="hover:text-danger"
              onClick={() => (items.length > 0 ? setConfirm(true) : ops.removeSection(section.id))}
              aria-label={`Remove ${section.title}`} title="Remove section"
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
        )}
      </div>

      {practical ? (
        <PracticalTable key={`${section.practical?.rows}-${section.practical?.marks}-${section.practical?.columns.join("|")}`} section={section} locked={locked} ops={ops} />
      ) : (
        <>
          {items.length === 0 ? (
            <p className="py-4 font-sans text-sm text-muted-foreground">
              {locked ? "No questions in this section." : "No questions here yet. Add them from the bank, or write one below."}
            </p>
          ) : (
            <ol className="mt-2 grid gap-1">
              {items.map((it) => (
                <ItemRow key={it.id} item={it} number={numbers[it.id] ?? 0} sections={sections} ops={ops} locked={locked} showAnswers={showAnswers} flash={flashId === it.id} />
              ))}
            </ol>
          )}
          {!locked && (
            <div className="font-sans mt-1">
              <Button variant="outline" size="sm" className="bg-white" onClick={() => ops.writeNew(section.id)}>
                <Plus aria-hidden /> Write a new question
              </Button>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Remove ${section.title}?`}
        confirmLabel="Remove section"
        tone="destructive"
        onConfirm={() => ops.removeSection(section.id)}
      >
        <p>
          The {items.length} {items.length === 1 ? "question" : "questions"} in it will come off the paper too. The question
          bank is not touched. To keep them, move them to another section first.
        </p>
      </ConfirmDialog>
    </section>
  );
}
