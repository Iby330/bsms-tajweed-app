"use client";

/**
 * Qur'an words typeset on screen (the paper sheet, bank and review cards, the
 * editors' previews): the words from `useQuranWords`, set by `QuranSnippet`,
 * with a quiet line while they load. If they cannot be had, the `fallback`
 * shows instead: the question's picture, so a failed load never leaves a
 * question without its Arabic.
 */
import type { ReactNode } from "react";
import { refLabel } from "@/lib/exam-builder/quran-lines";
import type { QuranRef } from "@/lib/exam-builder/types";
import { QuranSnippet } from "./quran-snippet";
import { useQuranWords } from "./use-quran-words";

export function TypesetAyah({
  quran,
  fallback,
  size = "passage",
}: {
  quran: QuranRef;
  /** Shown when the words fail to load or the range holds none (the picture). */
  fallback?: ReactNode;
  size?: "passage" | "option";
}) {
  const state = useQuranWords(quran);
  if (state.status === "ready" && state.words.length > 0) {
    return <QuranSnippet words={state.words} variant="screen" size={size} basmala={quran.basmala} circle={quran.circle} />;
  }
  const quiet = "font-sans text-xs font-normal text-muted-foreground";
  if (state.status === "loading" || state.status === "idle") {
    return <span className={`${quiet} inline-block`} aria-live="polite">Loading the Qur&apos;an words…</span>;
  }
  if (fallback) return <>{fallback}</>;
  const label = refLabel(quran);
  return <span className={`${quiet} inline-block`}>{label ? `${label}: ` : ""}the Qur&apos;an words could not load</span>;
}

/**
 * The `renderQuran` that `QuestionPrompt` and `OptionList` take on screen: a
 * ref, when set, is typeset in place of the picture, which stays the fallback.
 */
export function screenQuran(ref: QuranRef, fallback: ReactNode, where: "prompt" | "option"): ReactNode {
  return <TypesetAyah quran={ref} fallback={fallback} size={where === "option" ? "option" : "passage"} />;
}
