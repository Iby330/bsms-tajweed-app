"use client";

/**
 * The review page's edit form for one bank question, in a Dialog (a bottom sheet
 * on a phone). Sends only the fields that changed, plus the review status the
 * question should end on: approved, unless "keep it flagged" is ticked.
 */
import { useState, useTransition } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { optionFilled } from "@/lib/exam-builder/bank-validate";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { updateBankQuestion } from "@/lib/exam-builder/bank-actions";
import type { BankPatch } from "@/lib/exam-builder/bank-validate";
import { groupTopics } from "@/lib/exam-builder/topics";
import type { BankQuestion, McqOption, QuestionKind, Topic } from "@/lib/exam-builder/types";

type Props = {
  question: BankQuestion;
  topics: Topic[];
  onClose: () => void;
  onSaved: (patch: Partial<BankQuestion>) => void;
};

const label = "text-xs font-medium text-muted-foreground";
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function ReviewEditDialog({ question: q, topics, onClose, onSaved }: Props) {
  const [topicId, setTopicId] = useState(q.topic_id);
  const [kind, setKind] = useState<QuestionKind>(q.kind);
  const [prompt, setPrompt] = useState(q.prompt);
  const [images, setImages] = useState<string[]>(q.prompt_images);
  const [options, setOptions] = useState<McqOption[]>(
    q.options?.length ? q.options : [0, 1, 2, 3].map(() => ({ text: "", image: null, correct: false })),
  );
  const [selectMany, setSelectMany] = useState(q.select_many);
  const [answer, setAnswer] = useState(q.answer ?? "");
  const [marks, setMarks] = useState(q.marks === null || q.marks === undefined ? "" : String(q.marks));
  const [usedIn, setUsedIn] = useState<string[]>(q.used_in);
  const [newLabel, setNewLabel] = useState("");
  const [keepFlagged, setKeepFlagged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const groups = groupTopics(topics);

  function setOption(i: number, change: Partial<McqOption>) {
    setOptions((list) => list.map((o, j) => {
      if (j === i) return { ...o, ...change };
      // One right answer unless "select all that apply".
      if (change.correct && !selectMany) return { ...o, correct: false };
      return o;
    }));
  }

  function addLabel() {
    const s = newLabel.trim();
    if (s && !usedIn.some((u) => u.toLowerCase() === s.toLowerCase())) setUsedIn([...usedIn, s]);
    setNewLabel("");
  }

  function save() {
    setError(null);
    const m = marks.trim();
    const marksValue = m === "" ? null : Number(m);
    if (marksValue !== null && !Number.isFinite(marksValue)) { setError("Marks must be a number, or blank."); return; }
    const opts = kind === "mcq" ? options.filter(optionFilled) : null;

    const patch: BankPatch = { review_status: keepFlagged ? "check" : "approved" };
    if (topicId !== q.topic_id) patch.topic_id = topicId;
    if (kind !== q.kind) patch.kind = kind;
    if (prompt !== q.prompt) patch.prompt = prompt;
    if (!same(images, q.prompt_images)) patch.prompt_images = images;
    if (kind === "mcq" && !same(opts, q.options)) patch.options = opts;
    if (kind === "mcq" && selectMany !== q.select_many) patch.select_many = selectMany;
    if ((answer.trim() || null) !== (q.answer?.trim() || null)) patch.answer = answer;
    if (marksValue !== q.marks) patch.marks = marksValue;
    if (!same(usedIn, q.used_in)) patch.used_in = usedIn;

    start(async () => {
      const r = await updateBankQuestion(q.id, patch);
      if (!r.ok) { setError(r.error); return; }
      const local: Partial<BankQuestion> = {
        topic_id: topicId, kind, prompt: prompt.trim(), prompt_images: images,
        options: kind === "mcq" ? opts : null, select_many: kind === "mcq" ? selectMany : q.select_many,
        answer: answer.trim() || null, marks: marksValue, used_in: usedIn,
        review_status: keepFlagged ? "check" : "approved",
      };
      onSaved(local);
    });
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
      <DialogContent frameClassName="sm:max-w-2xl" className="gap-4">
        <DialogHeader>
          <DialogTitle>Edit this question</DialogTitle>
          <DialogDescription>
            Saving marks it approved. Papers already built keep their own copy.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <label className="grid gap-1">
            <span className={label}>Topic</span>
            <select
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
              className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
            >
              {groups.map((g) => g.children.length ? (
                <optgroup key={g.topic.id} label={g.topic.title}>
                  <option value={g.topic.id}>{g.topic.title} (general)</option>
                  {g.children.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </optgroup>
              ) : (
                <option key={g.topic.id} value={g.topic.id}>{g.topic.title}</option>
              ))}
            </select>
          </label>
          <fieldset className="grid gap-1">
            <legend className={label}>Type</legend>
            <div className="flex h-8 items-center gap-3 text-sm">
              {(["mcq", "short"] as const).map((k) => (
                <label key={k} className="flex items-center gap-1.5">
                  <input type="radio" name="kind" checked={kind === k} onChange={() => setKind(k)} />
                  {k === "mcq" ? "Multiple choice" : "Short answer"}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="grid gap-1">
            <span className={label}>Marks</span>
            <Input
              type="number" inputMode="decimal" step={0.5} min={0.5} max={100}
              value={marks} onChange={(e) => setMarks(e.target.value)}
              placeholder="not set" className="w-24"
            />
          </label>
        </div>

        <label className="grid gap-1">
          <span className={label}>Question</span>
          <Textarea dir="auto" value={prompt} onChange={(e) => setPrompt(e.target.value)} className="min-h-20" />
        </label>

        {images.length > 0 && (
          <div className="grid gap-1">
            <span className={label}>Pictures with the question</span>
            <div className="flex flex-wrap gap-2">
              {images.map((path) => (
                <div key={path} className="relative rounded-lg border border-border bg-card p-1">
                  {q.imageUrls[path] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={q.imageUrls[path]} alt="Arabic text for this question" className="max-h-20 max-w-56" />
                  ) : <span className="text-xs text-muted-foreground">Picture missing</span>}
                  <Button
                    type="button" size="icon-xs" variant="destructive" className="absolute -top-2 -right-2"
                    onClick={() => setImages(images.filter((p) => p !== path))}
                    aria-label="Remove this picture"
                  >
                    <X />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {kind === "mcq" && (
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className={label}>Options — tick the right one</span>
              <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={selectMany} onChange={(e) => setSelectMany(e.target.checked)} />
                Select all that apply
              </label>
            </div>
            {options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="checkbox" checked={o.correct} aria-label={`Option ${i + 1} is correct`}
                  onChange={(e) => setOption(i, { correct: e.target.checked })}
                  className="size-4 shrink-0"
                />
                <Input dir="auto" value={o.text} onChange={(e) => setOption(i, { text: e.target.value })} />
                {o.image && (o.image && q.imageUrls[o.image] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={q.imageUrls[o.image]} alt="" className="max-h-8 max-w-24 shrink-0" />
                ) : <span className="shrink-0 text-xs text-muted-foreground">picture</span>)}
                <Button
                  type="button" size="icon-sm" variant="ghost" aria-label={`Remove option ${i + 1}`}
                  onClick={() => setOptions(options.filter((_, j) => j !== i))}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            {options.length < 10 && (
              <Button
                type="button" size="sm" variant="outline" className="justify-self-start"
                onClick={() => setOptions([...options, { text: "", image: null, correct: false }])}
              >
                <Plus /> Add an option
              </Button>
            )}
          </div>
        )}

        <label className="grid gap-1">
          <span className={label}>Answer / mark scheme</span>
          <Textarea dir="auto" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="No answer yet" />
        </label>

        <div className="grid gap-1">
          <span className={label}>Used in</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {usedIn.map((u) => (
              <span key={u} className="inline-flex items-center gap-1 rounded-full bg-brand/15 py-0.5 pr-1 pl-2 text-xs text-brand">
                {u}
                <button
                  type="button" aria-label={`Remove ${u}`} className="rounded-full p-0.5 hover:bg-brand/20"
                  onClick={() => setUsedIn(usedIn.filter((x) => x !== u))}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <Input
              value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. EOT2 25/26"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLabel(); } }}
              className="h-7 w-32"
            />
            <Button type="button" size="sm" variant="outline" onClick={addLabel} disabled={!newLabel.trim()}>Add</Button>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={keepFlagged} onChange={(e) => setKeepFlagged(e.target.checked)} />
          Keep it in “Needs a look” (don’t approve yet)
        </label>

        {error && <p className="text-xs text-danger" role="alert">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="button" onClick={save} disabled={pending}>
            {pending ? "Saving…" : keepFlagged ? "Save" : "Save and approve"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
