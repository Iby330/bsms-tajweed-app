"use client";

/**
 * "Arabic for this question": a picture, the ayah typeset from the mushaf,
 * or none. Shared by the item editor and "Write a new question".
 *
 * `QuranRefFields` takes the surah and ayah range (and, behind "Part of an
 * ayah", the words) and previews the typeset text beneath, fetched a moment
 * after the typing stops.
 */
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { snippetKey } from "@/lib/exam-builder/quran-lines";
import { readDraft, surahTag, type RefDraft } from "@/lib/exam-builder/quran-ref-draft";
import type { QuranRef } from "@/lib/exam-builder/types";
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
  const set = (k: keyof RefDraft) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...draft, [k]: e.target.value });
  const typed = Object.values(draft).some((v) => v.trim());
  const [partOpen, setPartOpen] = useState(!!(draft.fromWord || draft.toWord));

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
      <details className="text-sm" open={partOpen} onToggle={(e) => setPartOpen(e.currentTarget.open)}>
        <summary className="w-fit cursor-pointer text-xs font-medium text-brand underline-offset-4 hover:underline">Part of an ayah</summary>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs font-medium">
            Only words from
            <Input type="number" inputMode="numeric" min={1} value={draft.fromWord} onChange={set("fromWord")} className={field} />
          </label>
          <label className="grid gap-1 text-xs font-medium">
            to
            <Input type="number" inputMode="numeric" min={1} value={draft.toWord} onChange={set("toWord")} className={field} />
          </label>
          <p className="basis-full text-xs text-muted-foreground">Words count from 1 at the start of the first ayah; &ldquo;to&rdquo; counts in the last ayah.</p>
        </div>
      </details>
      {!read.ok && (showErrors || typed) ? (
        <p className="text-xs text-danger" role="alert">{read.error}</p>
      ) : (
        <AyahPreview quran={settled} />
      )}
    </div>
  );
}
