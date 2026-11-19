"use client";

/**
 * A question's ayah typeset on screen (the paper sheet, bank and review
 * cards, the editors' previews): the words from `useQuranWords`, set by
 * `QuranSnippet`, with a quiet line while they load and a plain one if they
 * cannot be had.
 */
import { snippetLabel } from "@/lib/exam-builder/quran-lines";
import type { QuranRef } from "@/lib/exam-builder/types";
import { QuranSnippet } from "./quran-snippet";
import { useQuranWords } from "./use-quran-words";

export function TypesetAyah({ quran }: { quran: QuranRef }) {
  const state = useQuranWords(quran);
  if (state.status === "ready" && state.words.length > 0) {
    return <QuranSnippet words={state.words} variant="screen" />;
  }
  const quiet = "font-sans text-xs font-normal text-muted-foreground";
  if (state.status === "loading" || state.status === "idle") {
    return <p className={quiet} aria-live="polite">Loading the ayah…</p>;
  }
  return <p className={quiet}>{snippetLabel(quran)} — could not load the text</p>;
}

/** The slot `QuestionPrompt` takes: the typeset ayah when the question names one and has no picture. */
export function screenQuranSlot(q: { prompt_quran: QuranRef | null; prompt_images: string[] }) {
  return q.prompt_quran && q.prompt_images.filter(Boolean).length === 0 ? <TypesetAyah quran={q.prompt_quran} /> : undefined;
}
