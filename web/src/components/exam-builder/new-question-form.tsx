"use client";

/**
 * "Write a new question": a teacher's own question, which goes into the bank
 * (with who wrote it and when) and, from a paper, onto that paper too. A tick
 * keeps a one-off out of the bank. On the bank page it only adds to the bank.
 *
 * A picture of the Arabic is uploaded from the browser straight to the
 * exam-questions bucket under `new/<profile id>/`, then signed by the server
 * so it shows at once. The dialog waits for the server before closing (a new
 * question needs its id), and says so on the button.
 */
import { useMemo, useRef, useState, useTransition } from "react";
import { ImagePlus, ImageOff, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { signNewQuestionImage } from "@/lib/exam-builder/new-question-actions";
import { groupTopics } from "@/lib/exam-builder/topics";
import { EMPTY_DRAFT, readDraft, type RefDraft } from "@/lib/exam-builder/quran-ref-draft";
import type { McqOption, QuestionKind, QuranRef, Topic } from "@/lib/exam-builder/types";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { ArabicModeSwitch, QuranRefFields, type ArabicMode } from "./arabic-choice";

/** What the form hands back: the question as the actions take it. */
export type NewQuestionInput = {
  topic_id: string;
  kind: QuestionKind;
  prompt: string;
  prompt_images: string[];
  /** The ayah typeset from the mushaf, as an alternative to a picture. */
  prompt_quran: QuranRef | null;
  options: McqOption[] | null;
  select_many: boolean;
  answer: string | null;
  marks: number;
};

const BUCKET = "exam-questions";
const MAX_BYTES = 3 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const blank = (): McqOption => ({ text: "", image: null, correct: false });

type Errors = Partial<Record<"topic" | "prompt" | "options" | "marks" | "picture" | "ayah" | "form", string>>;

function Form({
  topics, profileId, mode, defaultKind, onSubmit, onDone,
}: {
  topics: Topic[];
  profileId: string;
  mode: "paper" | "bank";
  defaultKind: QuestionKind;
  onSubmit: (q: NewQuestionInput, keepOut: boolean, imageUrls: Record<string, string>) => Promise<string | void>;
  onDone: () => void;
}) {
  const groups = useMemo(() => groupTopics(topics), [topics]);
  const [topic, setTopic] = useState("");
  const [kind, setKind] = useState<QuestionKind>(defaultKind);
  const [prompt, setPrompt] = useState("");
  const [picture, setPicture] = useState<{ path: string; url: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [arabic, setArabic] = useState<ArabicMode>("picture");
  const [draft, setDraft] = useState<RefDraft>(EMPTY_DRAFT);
  const [options, setOptions] = useState<McqOption[]>([blank(), blank(), blank(), blank()]);
  const [selectMany, setSelectMany] = useState(false);
  const [marks, setMarks] = useState("1");
  const [answer, setAnswer] = useState("");
  const [keepOut, setKeepOut] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  /** Typing into a field clears its complaint. */
  const clear = (k: keyof Errors) => setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
  const setOpt = (i: number, patch: Partial<McqOption>) => {
    clear("options");
    setOptions((os) => os.map((o, j) => (j === i ? { ...o, ...patch } : patch.correct && !selectMany ? { ...o, correct: false } : o)));
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    const ext = TYPES[file.type];
    if (!ext) return setErrors((e) => ({ ...e, picture: "Choose a PNG, JPEG, WebP or GIF picture." }));
    if (file.size > MAX_BYTES) return setErrors((e) => ({ ...e, picture: "That picture is over 3 MB. Crop it or save it smaller." }));
    setErrors((e) => ({ ...e, picture: undefined }));
    setUploading(true);
    try {
      const path = `new/${profileId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabaseBrowser().storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw new Error(error.message);
      const signed = await signNewQuestionImage(path);
      if (!signed.ok) throw new Error(signed.error);
      setPicture({ path, url: signed.url });
    } catch {
      setErrors((e) => ({ ...e, picture: "The picture didn't upload. Check the connection and try again." }));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = () => {
    const next: Errors = {};
    const inBank = mode === "bank" || !keepOut;
    if (inBank && !topic) next.topic = "Pick the topic it belongs to.";
    if (!prompt.trim()) next.prompt = "Type the question.";
    const m = Number(marks);
    if (!marks.trim() || !Number.isFinite(m) || m < 0.5 || m > 100 || !Number.isInteger(m * 2)) {
      next.marks = "Marks must be between 0.5 and 100, in halves.";
    }
    const filled = options.filter((o) => o.text.trim() || o.image);
    if (kind === "mcq" && filled.length < 2) next.options = "Fill in at least two options.";
    const read = arabic === "typeset" ? readDraft(draft) : null;
    if (read && !read.ok) next.ayah = read.error;
    setErrors(next);
    if (Object.keys(next).length) return;

    const q: NewQuestionInput = {
      topic_id: topic,
      kind,
      prompt: prompt.trim(),
      prompt_images: arabic === "picture" && picture ? [picture.path] : [],
      prompt_quran: read?.ok ? read.ref : null,
      options: kind === "mcq" ? filled : null,
      select_many: kind === "mcq" && selectMany,
      answer: answer.trim() || null,
      marks: m,
    };
    start(async () => {
      let err: string | void;
      try {
        err = await onSubmit(q, mode === "paper" && keepOut, picture && arabic === "picture" ? { [picture.path]: picture.url } : {});
      } catch {
        err = "Couldn't reach the server. Check the connection and try again.";
      }
      if (err) setErrors({ form: err });
      else onDone();
    });
  };

  const fieldError = (msg?: string) => (msg ? <p className="text-xs font-normal text-danger" role="alert">{msg}</p> : null);
  const busy = pending || uploading;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Write a new question</DialogTitle>
        <DialogDescription>
          {mode === "bank"
            ? "It goes into the question bank under its topic, with your name and today's month as where it came from."
            : "It goes onto this paper and into the question bank, with your name and today's month as where it came from."}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-5">
        <label className="grid gap-1.5 text-sm font-medium">
          Topic
          <select
            value={topic}
            onChange={(e) => { setTopic(e.target.value); clear("topic"); }}
            aria-invalid={!!errors.topic}
            className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50 aria-invalid:border-danger"
          >
            <option value="">Choose a topic…</option>
            {groups.filter((g) => g.children.length > 0).map((g) => (
              <optgroup key={g.topic.id} label={g.topic.title}>
                {g.children.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
              </optgroup>
            ))}
            {groups.some((g) => g.children.length === 0) && (
              <optgroup label="Other subjects">
                {groups.filter((g) => g.children.length === 0).map((g) => (
                  <option key={g.topic.id} value={g.topic.id}>{g.topic.title}</option>
                ))}
              </optgroup>
            )}
          </select>
          {fieldError(errors.topic)}
        </label>

        <div className="grid gap-1.5">
          <span className="text-sm font-medium">Type</span>
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
        </div>

        <label className="grid gap-1.5 text-sm font-medium">
          Question
          <Textarea dir="auto" value={prompt} onChange={(e) => { setPrompt(e.target.value); clear("prompt"); }} aria-invalid={!!errors.prompt} placeholder="Type the question as it should read on the paper" className="min-h-20 text-base" />
          {fieldError(errors.prompt)}
        </label>

        <div className="grid gap-2.5">
          <span className="text-sm font-medium">Arabic for this question <span className="font-normal text-muted-foreground">· optional</span></span>
          <ArabicModeSwitch mode={arabic} onChange={(m) => { setArabic(m); clear("ayah"); clear("picture"); }} />
          {arabic === "typeset" && (
            <div className="grid gap-2 rounded-lg border border-line p-3">
              <QuranRefFields draft={draft} onChange={(d) => { setDraft(d); clear("ayah"); }} showErrors={!!errors.ayah} idPrefix="new-question" />
            </div>
          )}
          {arabic === "none" && <p className="text-xs text-muted-foreground">No Arabic under the question. Choose Picture to upload one, or Typeset ayah to set an ayah from the mushaf.</p>}
          {arabic !== "picture" ? null : picture ? (
            <div className="flex flex-wrap items-start gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={picture.url} alt="Arabic text for this question" className="exam-edit-image rounded border border-line bg-white" />
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-danger" onClick={() => setPicture(null)} disabled={busy}>
                <ImageOff aria-hidden /> Remove picture
              </Button>
            </div>
          ) : (
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="sr-only"
                id="new-question-picture"
                onChange={(e) => upload(e.target.files?.[0])}
                disabled={busy}
              />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
                {uploading ? <Loader2 className="animate-spin" aria-hidden /> : <ImagePlus aria-hidden />}
                {uploading ? "Uploading…" : "Add a picture"}
              </Button>
              <p className="mt-1 text-xs text-muted-foreground">A screenshot of the ayah or word. PNG, JPEG, WebP or GIF, up to 3 MB.</p>
            </div>
          )}
          {fieldError(errors.picture)}
        </div>

        {kind === "mcq" && (
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Options <span className="font-normal text-muted-foreground">· tick the correct {selectMany ? "ones" : "one"}</span></legend>
            {options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground" title="Correct answer">
                  <Checkbox checked={o.correct} onCheckedChange={(c) => setOpt(i, { correct: c === true })} aria-label={`Option ${i + 1} is correct`} />
                  <span className={cn("max-sm:sr-only", o.correct && "font-semibold text-ok")}>{o.correct ? "Correct" : "Correct?"}</span>
                </label>
                <Input dir="auto" value={o.text} onChange={(e) => setOpt(i, { text: e.target.value })} aria-label={`Option ${i + 1}`} placeholder={`Option ${i + 1}`} className="h-9 min-w-0 flex-1" />
                <Button variant="ghost" size="icon-xs" className="hover:text-danger" onClick={() => setOptions((os) => os.filter((_, j) => j !== i))} disabled={options.length <= 2} aria-label={`Remove option ${i + 1}`}><X /></Button>
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button variant="outline" size="sm" onClick={() => setOptions((os) => [...os, blank()])} disabled={options.length >= 10}>
                <Plus aria-hidden /> Add an option
              </Button>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={selectMany} onCheckedChange={(c) => setSelectMany(c === true)} />
                More than one can be correct
              </label>
            </div>
            {fieldError(errors.options)}
          </fieldset>
        )}

        <label className="grid gap-1.5 text-sm font-medium">
          Marks
          <Input type="number" inputMode="decimal" min={0.5} max={100} step={0.5} value={marks} onChange={(e) => { setMarks(e.target.value); clear("marks"); }} aria-invalid={!!errors.marks} className="h-9 w-28 tabular-nums" />
          {fieldError(errors.marks)}
        </label>

        <label className="grid gap-1.5 text-sm font-medium">
          Answer / mark scheme <span className="-mt-1 font-normal text-muted-foreground">optional, but the mark scheme needs it</span>
          <Textarea dir="auto" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="What earns the marks, e.g. Ikhfaa (1), because noon sakinah is followed by ت (1)" className="min-h-20" />
        </label>

        {mode === "paper" && (
          <label className="flex items-start gap-2 rounded-lg border border-line p-3 text-sm">
            <Checkbox checked={keepOut} onCheckedChange={(c) => { setKeepOut(c === true); clear("topic"); }} className="mt-0.5" />
            <span>
              Keep this question out of the bank (use it on this paper only)
              <span className="block text-xs text-muted-foreground">For a one-off. Other teachers won&apos;t see it in the bank.</span>
            </span>
          </label>
        )}
      </div>

      {errors.form && <p className="text-sm text-danger" role="alert">{errors.form}</p>}
      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={pending}>Cancel</Button>
        <Button onClick={save} disabled={busy}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {pending ? "Saving…" : mode === "bank" ? "Add to the bank" : keepOut ? "Add to this paper" : "Add to paper and bank"}
        </Button>
      </DialogFooter>
    </>
  );
}

export function NewQuestionForm({
  open, onOpenChange, topics, profileId, mode, defaultKind = "short", onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topics: Topic[];
  profileId: string;
  /** "paper": onto a paper (and the bank unless kept out); "bank": the bank page, bank only. */
  mode: "paper" | "bank";
  defaultKind?: QuestionKind;
  /** Save it; resolve with a refusal to show, or nothing when done. */
  onSubmit: (q: NewQuestionInput, keepOut: boolean, imageUrls: Record<string, string>) => Promise<string | void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent frameClassName="sm:max-w-2xl" className="grid-cols-[minmax(0,1fr)]">
        {open && (
          <Form
            topics={topics}
            profileId={profileId}
            mode={mode}
            defaultKind={defaultKind}
            onSubmit={onSubmit}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
