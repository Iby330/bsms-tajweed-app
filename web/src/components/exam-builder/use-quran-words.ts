"use client";

/**
 * The words of a typeset ayah, for the builder's screens: one module-level
 * store keyed by `snippetKey(ref)`, so the same ayah on the paper, in the
 * bank and in the editor is fetched once, and two cards asking at the same
 * moment share one request (`GET /api/exam-builder/quran`).
 *
 * The paper page loads the words for the questions already on the paper on
 * the server and hands them to `primeQuranWords`, so those render with the
 * page and nothing waits; only an ayah added or typed in later is fetched.
 *
 * `ready` with no words means the range holds no text (no such ayah); `failed`
 * means the request itself went wrong.
 */
import { useEffect, useSyncExternalStore } from "react";
import { isQuranRef, snippetKey, type SnippetWord } from "@/lib/exam-builder/quran-lines";
import type { QuranRef } from "@/lib/exam-builder/types";

export type QuranWordsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; words: SnippetWord[] }
  | { status: "failed" };

const IDLE: QuranWordsState = { status: "idle" };
const LOADING: QuranWordsState = { status: "loading" };
const FAILED: QuranWordsState = { status: "failed" };

const store = new Map<string, QuranWordsState>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Seed the store with words the server already loaded (`loadQuranSnippets`). */
export function primeQuranWords(byKey: Record<string, SnippetWord[]> | undefined) {
  if (!byKey) return;
  for (const [key, words] of Object.entries(byKey)) {
    if (store.get(key)?.status !== "ready") store.set(key, { status: "ready", words });
  }
}

function load(ref: QuranRef) {
  const key = snippetKey(ref);
  const now = store.get(key);
  if (now && now.status !== "failed") return; // loading or ready: nothing to do
  store.set(key, LOADING);
  notify();
  const q = new URLSearchParams({ surah: String(ref.surah), from: String(ref.from_ayah), to: String(ref.to_ayah) });
  if (ref.from_word != null) q.set("fromWord", String(ref.from_word));
  if (ref.to_word != null) q.set("toWord", String(ref.to_word));
  fetch(`/api/exam-builder/quran?${q}`)
    .then(async (res) => {
      // 400: the route found no such range. Not a failure to retry, an answer.
      if (res.status === 400) return [] as SnippetWord[];
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as SnippetWord[];
    })
    .then((words) => store.set(key, { status: "ready", words: Array.isArray(words) ? words : [] }))
    .catch(() => store.set(key, FAILED))
    .finally(notify);
}

/** The words for `ref` (null or an invalid ref: idle, nothing fetched). */
export function useQuranWords(ref: QuranRef | null | undefined): QuranWordsState {
  const valid = ref && isQuranRef(ref) ? ref : null;
  const key = valid ? snippetKey(valid) : null;
  const state = useSyncExternalStore(
    subscribe,
    () => (key ? store.get(key) ?? LOADING : IDLE),
    () => (key ? store.get(key) ?? LOADING : IDLE),
  );
  useEffect(() => {
    if (valid) load(valid);
    // `key` names the ref; `valid` is a fresh object each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}
