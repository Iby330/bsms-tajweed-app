"use client";

/**
 * "Arabic for this question": a picture, the ayah typeset from the mushaf,
 * or none. Shared by the item editor and "Write a new question".
 *
 * `QuranRefFields` takes the surah and ayah range, then shows the ayah's
 * words to click: left alone the whole ayah is used; one click takes that
 * word, a second click takes everything from the first to it. The typeset
 * text is previewed beneath, fetched a moment after the typing stops.
 */
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { snippetKey } from "@/lib/exam-builder/quran-lines";
import { readDraft, surahTag, type RefDraft } from "@/lib/exam-builder/quran-ref-draft";
import type { QuranRef } from "@/lib/exam-builder/types";
import type { QuranWord } from "@/lib/quran/mushaf";
import { cn } from "@/lib/utils";
import { QuranSnippet } from "./quran-snippet";
import { useQuranWords } from "./use-quran-words";

export type ArabicMode = "picture" | "typeset" | "none";

const MODES: [ArabicMode, string][] = [["picture", "Picture"], ["typeset", "Typeset ayah"], ["none", "None"]];

export function ArabicModeSwitch({ mode, onChange }: { mode: ArabicMode; onChange: (m: ArabicMode) => void }) {
  return (
    <div role="radiogroup" aria-label="Arabic for this question" className="inline-flex w-fit max-w-full overflow-hidden rounded-lg border border-line">
      {MODES.map(([m, label]) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          onClick={() => onChange(m)}
          className={cn(
            "min-h-9 px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-4",
            mode === m ? "bg-[color-mix(in_oklab,var(--brand)_28%,var(--card))] text-foreground" : "bg-card text-muted-foreground hover:bg-muted",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** `value`, but only once it has stopped changing for `ms`. */
function useSettled<T>(value: T, key: string, ms = 400): T {
  const [settled, setSettled] = useState({ key, value });
  useEffect(() => {
    if (settled.key === key) return;
    const t = setTimeout(() => setSettled({ key, value }), ms);
    return () => clearTimeout(t);
  }, [key, value, ms, settled.key]);
  return settled.value;
}

/** The typeset ayah for a ref, as a preview on a white card (it is how the paper will look). */
export function AyahPreview({ quran }: { quran: QuranRef | null }) {
  const state = useQuranWords(quran);
  let body: React.ReactNode;
  if (!quran) body = null;
  else if (state.status === "ready" && state.words.length > 0) body = <QuranSnippet words={state.words} variant="screen" basmala={quran.basmala} circle={quran.circle} />;
  else if (state.status === "ready") body = <p className="text-xs text-danger" role="alert">That range has no text. Check the surah and ayah numbers.</p>;
  else if (state.status === "failed") body = <p className="text-xs text-danger" role="alert">The text could not be loaded. Check the connection and try again.</p>;
  else body = <p className="text-xs text-muted-foreground" aria-live="polite">Loading the ayah…</p>;
  if (!body) return null;
  return (
    <div className="exam-ayah-preview rounded-lg border border-line bg-white px-3 py-2 text-[#00004d]" aria-label="Preview of the typeset ayah">
      {body}
    </div>
  );
}

const field = "h-9 w-20 tabular-nums";

/** A word's place in the range: ayah, then position, as one sortable number. */
const at = (ayah: number, position: number) => ayah * 1000 + position;

/** The ayah range the words are picked from: what the teacher typed, before any words were chosen. */
type Span = { from: string; to: string };

function WordPicker({ draft, span, onChange }: { draft: RefDraft; span: Span; onChange: (d: RefDraft) => void }) {
  const base = readDraft({ surah: draft.surah, from: span.from, to: span.to, fromWord: "", toWord: "" });
  const baseRef = base.ok ? base.ref : null;
  const settled = useSettled(baseRef, baseRef ? snippetKey(baseRef) : "");
  const state = useQuranWords(settled);
  if (!settled || state.status !== "ready") return null;
  const words = state.words.filter((w) => !w.isEnd);
  if (words.length === 0) return null;

  const read = readDraft(draft);
  const chosen = !!(draft.fromWord.trim() || draft.toWord.trim()) && read.ok;
  const lo = chosen ? at(read.ref.from_ayah, read.ref.from_word ?? 1) : -1;
  const hi = chosen ? at(read.ref.to_ayah, read.ref.to_word ?? 999) : -1;
  const count = chosen ? words.filter((w) => at(w.ayah, w.position) >= lo && at(w.ayah, w.position) <= hi).length : 0;

  const whole = () => onChange({ ...draft, from: span.from, to: span.to, fromWord: "", toWord: "" });
  const pick = (w: QuranWord) => {
    const k = at(w.ayah, w.position);
    if (chosen && lo === hi && k === lo) return whole();
    const [a, b] = chosen && lo === hi ? [Math.min(lo, k), Math.max(lo, k)] : [k, k];
    const fa = Math.floor(a / 1000), ta = Math.floor(b / 1000);
    onChange({ ...draft, from: String(fa), to: ta === fa ? "" : String(ta), fromWord: String(a % 1000), toWord: String(b % 1000) });
  };

  return (
    <div className="grid gap-1.5">
      <div dir="rtl" className="flex flex-wrap gap-1" role="group" aria-label="The words of the ayah: click to choose some">
        {words.map((w) => {
          const on = chosen && at(w.ayah, w.position) >= lo && at(w.ayah, w.position) <= hi;
          return (
            <button
              key={`${w.ayah}:${w.position}`}
              type="button"
              aria-pressed={on}
              title={`Ayah ${w.ayah}, word ${w.position}`}
              onClick={() => pick(w)}
              className={cn(
                "rounded-md border px-1.5 text-[#00004d] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on ? "border-brand bg-[color-mix(in_oklab,var(--brand)_28%,white)]" : "border-line bg-white hover:border-foreground/40",
              )}
            >
              <QuranSnippet words={[w]} variant="screen" size="option" />
            </button>
          );
        })}
      </div>
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        {chosen ? (
          <>
            <span>{count === 1 ? "1 word chosen." : `${count} words chosen.`} Click a word to start again.</span>
            <button type="button" onClick={whole} className="font-medium text-brand underline-offset-4 hover:underline">Use the whole ayah</button>
          </>
        ) : (
          <span>The whole ayah is used. To use only some of it, click a word, or click the first word and then the last.</span>
        )}
      </p>
    </div>
  );
}

export function QuranRefFields({
  draft, onChange, showErrors, idPrefix,
}: {
  draft: RefDraft;
  onChange: (d: RefDraft) => void;
  /** Show what is wrong with the numbers (after a save attempt, or once typed). */
  showErrors: boolean;
  idPrefix: string;
}) {
  const read = readDraft(draft);
  const ref = read.ok ? read.ref : null;
  const settled = useSettled(ref, ref ? snippetKey(ref) : "");
  const tag = surahTag(draft.surah);
  const typed = Object.values(draft).some((v) => v.trim());
  const [span, setSpan] = useState<Span>({ from: draft.from, to: draft.to });
  // Typing a surah or ayah number starts the words again.
  const set = (k: "surah" | "from" | "to") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (k !== "surah") setSpan((sp) => ({ ...sp, [k]: v }));
    onChange({ ...draft, ...(k === "surah" ? null : { from: span.from, to: span.to }), [k]: v, fromWord: "", toWord: "" });
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs font-medium" htmlFor={`${idPrefix}-surah`}>
          Surah number
          <span className="flex items-center gap-2">
            <Input id={`${idPrefix}-surah`} type="number" inputMode="numeric" min={1} max={114} value={draft.surah} onChange={set("surah")} className={field} />
            {tag && <span className="text-sm font-normal text-muted-foreground">{tag}</span>}
          </span>
        </label>
        <label className="grid gap-1 text-xs font-medium">
          From ayah
          <Input type="number" inputMode="numeric" min={1} value={draft.from} onChange={set("from")} className={field} />
        </label>
        <label className="grid gap-1 text-xs font-medium">
          To ayah
          <Input type="number" inputMode="numeric" min={1} value={draft.to} onChange={set("to")} placeholder={draft.from || ""} className={field} />
        </label>
      </div>
      <WordPicker draft={draft} span={span} onChange={onChange} />
      {!read.ok && (showErrors || typed) ? (
        <p className="text-xs text-danger" role="alert">{read.error}</p>
      ) : (
        <AyahPreview quran={settled} />
      )}
    </div>
  );
}
