"use client";

/**
 * Edit the paper's copy of a question "from its base": wording, type,
 * options and which are correct, marks, the answer / mark scheme, writing
 * lines, and its pictures. The bank's original is never touched.
 *
 * Qur'an words named by a ref are typeset in place of the picture, which
 * stays stored as the fallback. "Picture" for the question's Arabic clears
 * the copy's ref so the picture shows. Each option can carry Arabic of its
 * own, a picture or typeset words (see option-arabic.tsx).
 *
 * The same form edits a BANK question (BankEditor, admins only): there it
 * changes the original for every teacher, marks may be left blank, the topic
 * can be moved, and writing lines are not asked (a bank question has none).
 */
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, ImageOff, Plus, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { optionFilled } from "@/lib/exam-builder/bank-validate";
import { refLabel } from "@/lib/exam-builder/quran-lines";
import { draftFromRef, readDraft, type RefDraft } from "@/lib/exam-builder/quran-ref-draft";
import { groupTopics } from "@/lib/exam-builder/topics";
import type { BankQuestion, PaperItem, QuestionKind, Result, Topic } from "@/lib/exam-builder/types";
import { cn } from "@/lib/utils";
import { ArabicModeSwitch, AyahPreview, QuranRefFields, type ArabicMode } from "./arabic-choice";
import { blankOption, keepMarks, OptionArabic, readOption, toFormOption, type FormOption } from "./option-arabic";
import { OriginalPictures } from "./original-pictures";
import type { Item } from "./paper-state";

export type ItemPatch = Partial<Pick<PaperItem, "prompt" | "options" | "select_many" | "answer" | "marks" | "answer_lines" | "prompt_images" | "prompt_quran" | "kind">>;
/** What the form sends for a bank question: marks may be blank, and it has a topic but no writing lines. */
export type BankEditPatch = Omit<ItemPatch, "marks" | "answer_lines"> & { marks?: number | null; topic_id?: string };
type AnyPatch = Omit<ItemPatch, "marks"> & { marks?: number | null; topic_id?: string };

/** What the form needs of a question, whether it is a paper's copy or the bank's original. */
type Editable = Pick<PaperItem, "id" | "kind" | "prompt" | "prompt_images" | "prompt_quran" | "options" | "select_many" | "answer"> & {
  marks: number | null;
  answer_lines?: number;
  topic_id?: string;
  imageUrls: Record<string, string>;
};

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

function Form({ item, profileId, bankTopics, onSave, onDone }: {
  item: Editable; profileId: string;
  /** Set when this is the bank's original: its topics, for moving the question. */
  bankTopics?: Topic[];
  onSave: (patch: AnyPatch, imageUrls: Record<string, string>) => Promise<Result>; onDone: () => void;
}) {
  const bank = !!bankTopics;
  const [topicId, setTopicId] = useState(item.topic_id ?? "");
  const [kind, setKind] = useState<QuestionKind>(item.kind);
  const [prompt, setPrompt] = useState(item.prompt === "New question" ? "" : item.prompt);
  const [images, setImages] = useState<string[]>(item.prompt_images);
  const [options, setOptions] = useState<FormOption[]>(() =>
    item.options?.length ? item.options.map(toFormOption) : [blankOption(), blankOption(), blankOption(), blankOption()]);
  const [newUrls, setNewUrls] = useState<Record<string, string>>({});
  const urls = { ...item.imageUrls, ...newUrls };
  const [selectMany, setSelectMany] = useState(item.select_many);
  const [marks, setMarks] = useState(item.marks == null ? "" : String(item.marks));
  const [answer, setAnswer] = useState(item.answer ?? "");
  const [lines, setLines] = useState(String(item.answer_lines ?? 0));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Arabic for the question. A ref wins over the pictures, which stay stored
  // as the fallback; "Picture" clears this copy's ref so the picture shows.
  const hadPictures = item.prompt_images.filter(Boolean).length > 0;
  const [mode, setMode] = useState<ArabicMode>(item.prompt_quran ? "typeset" : hadPictures ? "picture" : "none");
  const [draft, setDraft] = useState<RefDraft>(() => draftFromRef(item.prompt_quran));
  const [refErrors, setRefErrors] = useState(false);
  const switchToTypeset = () => setMode("typeset");
  const setOpt = (i: number, patch: Partial<FormOption>) =>
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
      const blank = bank && !marks.trim();
      const m = blank ? null : Number(marks);
      if (!prompt.trim()) return setError("The question can't be empty.");
      if (m !== null && (!Number.isFinite(m) || m < 0.5 || m > 100 || !Number.isInteger(m * 2))) {
        return setError(bank ? "Marks must be blank, or between 0.5 and 100 in halves." : "Marks must be between 0.5 and 100, in halves.");
      }
      const patch: AnyPatch = {
        kind,
        prompt,
        prompt_images: images,
        marks: m,
        answer: answer.trim() ? answer : null,
      };
      if (mode === "typeset") {
        const read = readDraft(draft);
        if (!read.ok) { setRefErrors(true); return setError(`Typeset ayah: ${read.error}`); }
        // The pictures stay as the fallback, shown only if the words cannot load.
        patch.prompt_quran = keepMarks(read.ref, item.prompt_quran);
      } else if (mode === "picture") {
        patch.prompt_quran = null;
      } else if (mode === "none") {
        patch.prompt_images = [];
        patch.prompt_quran = null;
      }
      if (kind === "mcq") {
        const read = options.map((o, i) => readOption(o, i + 1));
        const bad = read.find((r) => !r.ok);
        if (bad && !bad.ok) return setError(bad.error);
        patch.options = read.flatMap((r) => (r.ok && optionFilled(r.option) ? [r.option] : []));
        patch.select_many = selectMany;
      } else if (!bank) {
        const l = Number(lines);
        if (!Number.isInteger(l) || l < 0 || l > 30) return setError("Writing lines must be a whole number from 0 to 30.");
        patch.answer_lines = l;
      }
      if (bank && topicId && topicId !== item.topic_id) patch.topic_id = topicId;
      const res = await onSave(patch, newUrls);
      if (!res.ok) setError(res.error);
      else onDone();
    });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{bank ? "Edit this bank question" : "Edit question"}</DialogTitle>
        <DialogDescription>
          {bank
            ? "This changes the question in the bank for every teacher. Papers already built keep their own copy."
            : "Changes apply to this paper only. The question bank stays as it was."}
        </DialogDescription>
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

        {bankTopics && (
          <label className="grid gap-1.5 text-sm font-medium">
            Topic
            <select
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
              className="h-9 w-full max-w-sm rounded-lg border border-input bg-transparent px-2 text-sm font-normal dark:bg-input/30"
            >
              {groupTopics(bankTopics).map((g) => g.children.length ? (
                <optgroup key={g.topic.id} label={g.topic.title}>
                  <option value={g.topic.id}>{g.topic.title} (general)</option>
                  {g.children.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </optgroup>
              ) : (
                <option key={g.topic.id} value={g.topic.id}>{g.topic.title}</option>
              ))}
            </select>
          </label>
        )}

        <label className="grid gap-1.5 text-sm font-medium">
          Question
          <Textarea dir="auto" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Type the question" className="min-h-20 text-base" autoFocus={!prompt} />
        </label>

        <div className="grid gap-2.5" data-testid="arabic-choice">
          <span className="text-sm font-medium">Arabic for this question</span>
          <ArabicModeSwitch mode={mode} onChange={(m) => { setMode(m); setError(null); }} />
          <OriginalPictures question={item} />

          {mode === "picture" && (
            images.length > 0 ? (
              <div className={cn("grid gap-3", item.prompt_quran && "sm:grid-cols-2")}>
                <div className="grid content-start gap-2">
                  {item.prompt_quran && <span className="text-xs text-muted-foreground">The picture: saving shows it {bank ? "in the bank" : "on this paper"} instead of the typeset words</span>}
                  {images.map((p, i) => (
                    <Picture key={`${p}-${i}`} url={item.imageUrls[p]} onRemove={() => setImages((xs) => xs.filter((_, j) => j !== i))} label={`Remove picture ${i + 1}`} />
                  ))}
                </div>
                {item.prompt_quran && (
                  <div className="grid content-start gap-2">
                    <span className="text-xs text-muted-foreground">
                      The same words typeset{refLabel(item.prompt_quran) ? ` (${refLabel(item.prompt_quran)})` : ""}
                    </span>
                    <AyahPreview quran={item.prompt_quran} />
                    <Button variant="outline" size="sm" className="w-fit" onClick={switchToTypeset}>
                      <Undo2 aria-hidden /> Use the typeset words
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {hadPictures ? "The picture is removed. Save to take it off, or Cancel to keep it." : "This question has no picture. Choose Typeset ayah to set the ayah from the mushaf."}
              </p>
            )
          )}

          {mode === "typeset" && (
            <div className="grid gap-3 rounded-lg border border-line p-3">
              <QuranRefFields draft={draft} onChange={(d) => { setDraft(d); setRefErrors(false); }} showErrors={refErrors} idPrefix={`edit-${item.id}`} />
              {images.filter(Boolean).length > 0 && (
                <div className="grid gap-2 border-t border-line pt-3">
                  <p className="text-xs text-muted-foreground">
                    The picture stays with the question and shows only if the typeset words cannot load.
                  </p>
                  <Button variant="ghost" size="sm" className="w-fit" onClick={() => { setMode("picture"); setError(null); }}>
                    <Undo2 aria-hidden /> Show the picture instead
                  </Button>
                </div>
              )}
            </div>
          )}

          {mode === "none" && (
            <p className="text-xs text-muted-foreground">
              {hadPictures || item.prompt_quran ? (bank ? "No Arabic under the question: saving takes the picture and ayah off the bank's question." : "No Arabic under the question: saving takes the picture and ayah off this paper's copy.") : "No Arabic under the question."}
            </p>
          )}
        </div>

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
                <OptionArabic
                  option={o} n={i + 1} idPrefix={`edit-${item.id}`} profileId={profileId} imageUrls={urls}
                  onChange={(p) => setOpt(i, p)}
                  onUploaded={(path, url) => setNewUrls((u) => ({ ...u, [path]: url }))}
                />
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button variant="outline" size="sm" onClick={() => setOptions((os) => [...os, blankOption()])} disabled={options.length >= 10}>
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
            <Input type="number" inputMode="decimal" min={0.5} max={100} step={0.5} value={marks} onChange={(e) => setMarks(e.target.value)} placeholder={bank ? "not set" : undefined} className="h-9 w-28 tabular-nums" />
          </label>
          {kind === "short" && !bank && (
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
  item, profileId, onOpenChange, onSave,
}: {
  item: Item | null;
  /** The signed-in teacher: new pictures upload under new/<profileId>/. */
  profileId: string;
  onOpenChange: (open: boolean) => void;
  /** `imageUrls`: signed URLs for pictures uploaded in the editor, so they show at once. */
  onSave: (id: string, patch: ItemPatch, imageUrls: Record<string, string>) => Promise<Result>;
}) {
  return (
    <Dialog open={item !== null} onOpenChange={onOpenChange}>
      <DialogContent frameClassName="sm:max-w-2xl" className="grid-cols-[minmax(0,1fr)]">
        {item && <Form key={item.id} item={item} profileId={profileId} onSave={(p, u) => onSave(item.id, p as ItemPatch, u)} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

/** The same form on the bank's own question. Shown to admins; the action refuses anyone else. */
export function BankEditor({
  question, topics, profileId, onOpenChange, onSave,
}: {
  question: BankQuestion | null;
  topics: Topic[];
  profileId: string;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, patch: BankEditPatch, imageUrls: Record<string, string>) => Promise<Result>;
}) {
  return (
    <Dialog open={question !== null} onOpenChange={onOpenChange}>
      <DialogContent frameClassName="sm:max-w-2xl" className="grid-cols-[minmax(0,1fr)]">
        {question && (
          <Form
            key={question.id} item={question} profileId={profileId} bankTopics={topics}
            onSave={(p, u) => onSave(question.id, p as BankEditPatch, u)} onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
