"use client";

/**
 * The paper's header: its name (the teacher's own label, never printed),
 * title, date line, duration, code and season (which
 * together make the "used in" stamp, e.g. EOT1 26/27) and the numbered notes.
 * Saves through the workspace, which updates the sheet at once and reports
 * any refusal back here.
 */
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { usedLabel } from "@/lib/exam-builder/labels";
import { PAPER_LIMITS } from "@/lib/exam-builder/validate";
import type { Paper, Result } from "@/lib/exam-builder/types";

type Patch = Partial<Pick<Paper, "name" | "title" | "date_label" | "duration_label" | "code" | "season" | "notes">>;

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      {children}
      {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
    </label>
  );
}

function Form({ paper, onSave, onDone }: { paper: Paper; onSave: (p: Patch) => Promise<Result>; onDone: () => void }) {
  const [name, setName] = useState(paper.name);
  const [title, setTitle] = useState(paper.title);
  const [date, setDate] = useState(paper.date_label);
  const [duration, setDuration] = useState(paper.duration_label);
  const [code, setCode] = useState(paper.code);
  const [season, setSeason] = useState(paper.season);
  const [notes, setNotes] = useState<string[]>(paper.notes.length ? paper.notes : [""]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const setNote = (i: number, v: string) => setNotes((ns) => ns.map((n, j) => (j === i ? v : n)));
  const moveNote = (i: number, d: -1 | 1) =>
    setNotes((ns) => {
      const j = i + d;
      if (j < 0 || j >= ns.length) return ns;
      const n = [...ns];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  const save = () =>
    start(async () => {
      setError(null);
      const patch: Patch = {};
      if (name.trim() !== paper.name) patch.name = name;
      if (title !== paper.title) patch.title = title;
      if (date !== paper.date_label) patch.date_label = date;
      if (duration !== paper.duration_label) patch.duration_label = duration;
      if (code !== paper.code) patch.code = code;
      if (season !== paper.season) patch.season = season;
      const cleanNotes = notes.map((n) => n.trim()).filter(Boolean);
      if (JSON.stringify(cleanNotes) !== JSON.stringify(paper.notes)) patch.notes = cleanNotes;
      if (Object.keys(patch).length === 0) return onDone();
      const res = await onSave(patch);
      if (!res.ok) setError(res.error);
      else onDone();
    });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Paper details</DialogTitle>
        <DialogDescription>Its name, and what prints at the top of the paper.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4">
        <Field label="Paper name" hint="For you, to tell papers apart. It is not printed. For example: Advanced">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Untitled paper" maxLength={PAPER_LIMITS.name} />
        </Field>
        <Field label="Title" hint="Printed at the top of the paper.">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="End Of Term 1 Exam" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date line" hint="Printed in italics, e.g. November 2026">
            <Input value={date} onChange={(e) => setDate(e.target.value)} placeholder="November 2026" />
          </Field>
          <Field label="Duration" hint="e.g. 90 mins">
            <Input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="90 mins" />
          </Field>
          <Field label="Exam code" hint="EOT1, EOT2, EOY…">
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="EOT1" />
          </Field>
          <Field label="Season" hint="e.g. 26/27">
            <Input value={season} onChange={(e) => setSeason(e.target.value)} placeholder="26/27" />
          </Field>
        </div>
        <p className="rounded-md bg-brand/15 px-3 py-2 text-xs text-foreground">
          When marked final, its questions will be stamped as <b>{usedLabel(code || "?", season || "?")}</b> in the bank.
        </p>
        <fieldset className="grid gap-2">
          <legend className="mb-1.5 text-sm font-medium">Notes</legend>
          {notes.map((n, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className="w-5 pt-2 text-right text-sm text-muted-foreground tabular-nums">{i + 1}.</span>
              <Textarea value={n} onChange={(e) => setNote(i, e.target.value)} aria-label={`Note ${i + 1}`} className="min-h-10 flex-1" />
              <div className="flex flex-col">
                <Button variant="ghost" size="icon-xs" onClick={() => moveNote(i, -1)} disabled={i === 0} aria-label={`Move note ${i + 1} up`}><ArrowUp /></Button>
                <Button variant="ghost" size="icon-xs" onClick={() => moveNote(i, 1)} disabled={i === notes.length - 1} aria-label={`Move note ${i + 1} down`}><ArrowDown /></Button>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => setNotes((ns) => ns.filter((_, j) => j !== i))} aria-label={`Remove note ${i + 1}`}><X /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="w-fit" onClick={() => setNotes((ns) => [...ns, ""])} disabled={notes.length >= 12}>
            <Plus /> Add a note
          </Button>
        </fieldset>
      </div>
      {error && <p className="text-xs text-danger" role="alert">{error}</p>}
      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={pending}>Cancel</Button>
        <Button onClick={save} disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
      </DialogFooter>
    </>
  );
}

export function PaperHeaderForm({
  open, onOpenChange, paper, onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  paper: Paper;
  onSave: (p: Patch) => Promise<Result>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent frameClassName="sm:max-w-xl" className="grid-cols-[minmax(0,1fr)]">
        {open && <Form paper={paper} onSave={onSave} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
