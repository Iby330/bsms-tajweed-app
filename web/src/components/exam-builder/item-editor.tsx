"use client";

/**
 * Edit the paper's copy of a question "from its base": wording, type,
 * options and which are correct, marks, the answer / mark scheme, writing
 * lines, and its pictures. The bank's original is never touched.
 */
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, ImageOff, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { McqOption, PaperItem, QuestionKind, Result } from "@/lib/exam-builder/types";
import { cn } from "@/lib/utils";
import type { Item } from "./paper-state";

export type ItemPatch = Partial<Pick<PaperItem, "prompt" | "options" | "select_many" | "answer" | "marks" | "answer_lines" | "prompt_images" | "kind">>;

const blank = (): McqOption => ({ text: "", image: null, correct: false });

function Picture({ url, onRemove, label }: { url?: string; onRemove: () => void; label: string }) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="Arabic text for this question" className="max-h-24 max-w-full rounded border sm:max-w-[16rem] border-line bg-white" />
      ) : (
        <span className="rounded border border-dashed border-line px-2 py-1 text-xs text-muted-foreground">Picture missing</span>
      )}
      <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-danger" onClick={onRemove} aria-label={label}>
        <ImageOff /> Remove picture
      </Button>
    </div>
  );
}

function Form({ item, onSave, onDone }: { item: Item; onSave: (patch: ItemPatch) => Promise<Result>; onDone: () => void }) {
  const [kind, setKind] = useState<QuestionKind>(item.kind);
  const [prompt, setPrompt] = useState(item.prompt === "New question" ? "" : item.prompt);
  const [images, setImages] = useState<string[]>(item.prompt_images);
  const [options, setOptions] = useState<McqOption[]>(item.options?.length ? item.options : [blank(), blank(), blank(), blank()]);
  const [selectMany, setSelectMany] = useState(item.select_many);
  const [marks, setMarks] = useState(String(item.marks));
  const [answer, setAnswer] = useState(item.answer ?? "");
  const [lines, setLines] = useState(String(item.answer_lines));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const setOpt = (i: number, patch: Partial<McqOption>) =>
    setOptions((os) => os.map((o, j) => (j === i ? { ...o, ...patch } : patch.correct && !selectMany ? { ...o, correct: false } : o)));
  const moveOpt = (i: number, d: -1 | 1) =>
    setOptions((os) => {
      const j = i + d;
      if (j < 0 || j >= os.length) return os;
      const n = [...os];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  const noCorrect = kind === "mcq" && !options.some((o) => o.correct);

  const save = () =>
    start(async () => {
      setError(null);
      const m = Number(marks);
      if (!prompt.trim()) return setError("The question can't be empty.");
      if (!Number.isFinite(m) || m < 0.5 || m > 100 || !Number.isInteger(m * 2)) {
        return setError("Marks must be between 0.5 and 100, in halves.");
      }
      const patch: ItemPatch = {
        kind,
        prompt,
        prompt_images: images,
        marks: m,
        answer: answer.trim() ? answer : null,
      };
      if (kind === "mcq") {
        patch.options = options.filter((o) => o.text.trim() || o.image);
        patch.select_many = selectMany;
      } else {
        const l = Number(lines);
        if (!Number.isInteger(l) || l < 0 || l > 30) return setError("Writing lines must be a whole number from 0 to 30.");
        patch.answer_lines = l;
      }
      const res = await onSave(patch);
      if (!res.ok) setError(res.error);
      else onDone();
    });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit question</DialogTitle>
        <DialogDescription>Changes apply to this paper only. The question bank stays as it was.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-5">
        <div role="radiogroup" aria-label="Question type" className="inline-flex w-fit overflow-hidden rounded-lg border border-line">
          {([["mcq", "Multiple choice"], ["short", "Short answer"]] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={cn(
                "min-h-9 px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                kind === k ? "bg-[color-mix(in_oklab,var(--brand)_28%,var(--card))] text-foreground" : "bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="grid gap-1.5 text-sm font-medium">
          Question
          <Textarea dir="auto" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Type the question" className="min-h-20 text-base" autoFocus={!prompt} />
        </label>

        {images.length > 0 && (
          <div className="grid gap-2">
            <span className="text-sm font-medium">Pictures</span>
            {images.map((p, i) => (
              <Picture key={`${p}-${i}`} url={item.imageUrls[p]} onRemove={() => setImages((xs) => xs.filter((_, j) => j !== i))} label={`Remove picture ${i + 1}`} />
            ))}
          </div>
        )}

        {kind === "mcq" ? (
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Options <span className="font-normal text-muted-foreground">· tick the correct {selectMany ? "ones" : "one"}</span></legend>
            {options.map((o, i) => (
              <div key={i} className="grid gap-1.5 rounded-lg border border-line p-2">
                <div className="flex items-center gap-2">
                  <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground" title="Correct answer">
                    <Checkbox checked={o.correct} onCheckedChange={(c) => setOpt(i, { correct: c === true })} aria-label={`Option ${i + 1} is correct`} />
                    <span className={cn("max-sm:sr-only", o.correct && "font-semibold text-ok")}>{o.correct ? "Correct" : "Correct?"}</span>
                  </label>
                  <Input dir="auto" value={o.text} onChange={(e) => setOpt(i, { text: e.target.value })} aria-label={`Option ${i + 1}`} placeholder={`Option ${i + 1}`} className="h-9 min-w-0 flex-1" />
                  <Button variant="ghost" size="icon-xs" onClick={() => moveOpt(i, -1)} disabled={i === 0} aria-label={`Move option ${i + 1} up`}><ArrowUp /></Button>
                  <Button variant="ghost" size="icon-xs" onClick={() => moveOpt(i, 1)} disabled={i === options.length - 1} aria-label={`Move option ${i + 1} down`}><ArrowDown /></Button>
                  <Button variant="ghost" size="icon-xs" className="hover:text-danger" onClick={() => setOptions((os) => os.filter((_, j) => j !== i))} aria-label={`Remove option ${i + 1}`}><X /></Button>
                </div>
                {o.image && (
                  <Picture url={item.imageUrls[o.image]} onRemove={() => setOpt(i, { image: null })} label={`Remove the picture in option ${i + 1}`} />
                )}
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button variant="outline" size="sm" onClick={() => setOptions((os) => [...os, blank()])} disabled={options.length >= 10}>
                <Plus /> Add an option
              </Button>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={selectMany} onCheckedChange={(c) => setSelectMany(c === true)} />
                More than one can be correct (select all that apply)
              </label>
            </div>
            {noCorrect && <p className="text-xs text-warn">No option is ticked as correct yet: the mark scheme will say &ldquo;Answer needed&rdquo;.</p>}
          </fieldset>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium">
            Marks
            <Input type="number" inputMode="decimal" min={0.5} max={100} step={0.5} value={marks} onChange={(e) => setMarks(e.target.value)} className="h-9 w-28 tabular-nums" />
          </label>
          {kind === "short" && (
            <label className="grid gap-1.5 text-sm font-medium">
              Writing lines on the paper
              <Input type="number" inputMode="numeric" min={0} max={30} step={1} value={lines} onChange={(e) => setLines(e.target.value)} className="h-9 w-28 tabular-nums" />
            </label>
          )}
        </div>

        <label className="grid gap-1.5 text-sm font-medium">
          Answer / mark scheme
          <Textarea dir="auto" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="What earns the marks, e.g. Ikhfaa (1), because noon sakinah is followed by ت (1)" className="min-h-20" />
        </label>
      </div>

      {error && <p className="text-xs text-danger" role="alert">{error}</p>}
      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={pending}>Cancel</Button>
        <Button onClick={save} disabled={pending}>{pending ? "Saving…" : "Save question"}</Button>
      </DialogFooter>
    </>
  );
}

export function ItemEditor({
  item, onOpenChange, onSave,
}: {
  item: Item | null;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, patch: ItemPatch) => Promise<Result>;
}) {
  return (
    <Dialog open={item !== null} onOpenChange={onOpenChange}>
      <DialogContent frameClassName="sm:max-w-2xl" className="grid-cols-[minmax(0,1fr)]">
        {item && <Form key={item.id} item={item} onSave={(p) => onSave(item.id, p)} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
