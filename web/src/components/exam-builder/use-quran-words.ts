"use client";

/**
 * The words of a typeset ayah, for the builder's screens: one module-level
 * store keyed by `snippetKey(ref)`, so the same ayah on the paper, in the
 * bank and in the editor is fetched once, and two cards asking at the same
 * moment share one request (`GET /api/exam-builder/quran`).
 *
 * Requests are batched: every ref asked for in one render (a bank view's
 * cards, a question's five options) waits one tick and goes in ONE request
 * (`?ref=…&ref=…`, at most `BATCH` a request), not one each.
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

/** Refs a request carries; the route takes up to 60. */
const BATCH = 40;
const queued = new Map<string, QuranRef>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function fetchBatch(keys: string[]) {
  const q = new URLSearchParams();
  for (const k of keys) q.append("ref", k);
  try {
    const res = await fetch(`/api/exam-builder/quran?${q}`);
    if (!res.ok) throw new Error(String(res.status));
    const byKey = (await res.json()) as Record<string, SnippetWord[]>;
    // A key left out is a range with no words: an answer, not a failure.
    for (const k of keys) store.set(k, { status: "ready", words: Array.isArray(byKey[k]) ? byKey[k] : [] });
  } catch {
    for (const k of keys) store.set(k, FAILED);
  }
  notify();
}

function flush() {
  flushTimer = null;
  const keys = [...queued.keys()];
  queued.clear();
  for (let i = 0; i < keys.length; i += BATCH) void fetchBatch(keys.slice(i, i + BATCH));
}

function load(ref: QuranRef) {
  const key = snippetKey(ref);
  const now = store.get(key);
  if (now && now.status !== "failed") return; // loading or ready: nothing to do
  store.set(key, LOADING);
  queued.set(key, ref);
  // Wait a tick, so every card mounted in this commit joins the same request.
  flushTimer ??= setTimeout(flush, 0);
  notify();
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
