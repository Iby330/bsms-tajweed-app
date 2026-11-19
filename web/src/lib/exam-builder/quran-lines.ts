/**
 * A question's ayah typeset from `quran_words` instead of shown as a picture:
 * the pure part — no IO, shared by the loader (quran.ts), the snippet
 * component and the route the builder fetches words from.
 *
 * The words are the app's own mushaf data (`QuranWord`, built by `fromRow`),
 * so the typeset ayah is set the way the mushaf reader sets it: one row per
 * printed line, each line in its page's QCF v1 font, drawn from `code_v1`
 * glyphs, every ayah closed by the page font's own numbered rosette.
 */
import { pageFont } from "@/lib/homework/tap-words";
import type { QuranWord } from "@/lib/quran/mushaf";
import type { QuranRef } from "./types";

export type SnippetWord = QuranWord;

export type SnippetLine = { page: number; line: number; font: string; words: SnippetWord[] };

/** `31:19-19`, or `104:1-2@2-3` with word bounds (`@-4` when only the end is set). */
export function snippetKey(ref: QuranRef): string {
  const base = `${ref.surah}:${ref.from_ayah}-${ref.to_ayah}`;
  if (ref.from_word == null && ref.to_word == null) return base;
  return `${base}@${ref.from_word ?? ""}-${ref.to_word ?? ""}`;
}

const posInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1;

/** A ref worth querying: surah 1–114, a forward ayah range, sane word bounds. */
export function isQuranRef(ref: unknown): ref is QuranRef {
  if (!ref || typeof ref !== "object") return false;
  const r = ref as Record<string, unknown>;
  if (!posInt(r.surah) || r.surah > 114) return false;
  if (!posInt(r.from_ayah) || !posInt(r.to_ayah) || r.to_ayah < r.from_ayah) return false;
  // 286 is the longest surah.
  if (r.to_ayah > 286) return false;
  if (r.from_word != null && !posInt(r.from_word)) return false;
  if (r.to_word != null && !posInt(r.to_word)) return false;
  return true;
}

/** One query per surah: the smallest ayah range covering every ref in it. */
export function ayahSpans(refs: QuranRef[]): { surah: number; from: number; to: number }[] {
  const by = new Map<number, { surah: number; from: number; to: number }>();
  for (const r of refs) {
    const s = by.get(r.surah);
    if (!s) by.set(r.surah, { surah: r.surah, from: r.from_ayah, to: r.to_ayah });
    else {
      s.from = Math.min(s.from, r.from_ayah);
      s.to = Math.max(s.to, r.to_ayah);
    }
  }
  return [...by.values()];
}

const byReading = (a: SnippetWord, b: SnippetWord) => a.ayah - b.ayah || a.position - b.position;

/** The words a ref asks for, in reading order. `from_word` bounds the first
 *  ayah, `to_word` the last; the end rosette is a word like any other, so a
 *  `to_word` short of the ayah's end leaves the ayah unclosed. */
export function sliceRef(words: SnippetWord[], ref: QuranRef): SnippetWord[] {
  return words
    .filter((w) => {
      if (w.surah !== ref.surah || w.ayah < ref.from_ayah || w.ayah > ref.to_ayah) return false;
      if (ref.from_word != null && w.ayah === ref.from_ayah && w.position < ref.from_word) return false;
      if (ref.to_word != null && w.ayah === ref.to_ayah && w.position > ref.to_word) return false;
      return true;
    })
    .sort(byReading);
}

/** The words in the mushaf's printed lines (page + line), in reading order. */
export function snippetLines(words: SnippetWord[]): SnippetLine[] {
  const out: SnippetLine[] = [];
  for (const w of words) {
    const last = out[out.length - 1];
    if (last && last.page === w.page && last.line === w.line) last.words.push(w);
    else out.push({ page: w.page, line: w.line, font: pageFont(w.page), words: [w] });
  }
  return out;
}

/** Each page the words are printed on, once — one @font-face apiece. */
export function snippetPages(words: SnippetWord[]): number[] {
  return [...new Set(words.map((w) => w.page))];
}

/** Glyphs only work as a set: one missing word and the whole snippet flows as text. */
export function hasAllGlyphs(words: SnippetWord[]): boolean {
  return words.length > 0 && words.every((w) => !!w.glyph && !!w.page && !!w.line);
}

/** Uthmanic Hafs (v22) has no glyph for precomposed آ; ا + ٓ it draws (LEARNINGS). */
const decomposeMadda = (s: string) => s.replace(/آ/g, "آ");

/** The flowing fallback: each ayah's words as one run, `ended` when its rosette is in range. */
export function flowingAyahs(words: SnippetWord[]): { ayah: number; text: string; ended: boolean }[] {
  const out: { ayah: number; text: string; ended: boolean }[] = [];
  for (const w of words) {
    let last = out[out.length - 1];
    if (!last || last.ayah !== w.ayah) {
      last = { ayah: w.ayah, text: "", ended: false };
      out.push(last);
    }
    if (w.isEnd) last.ended = true;
    else last.text = last.text ? `${last.text} ${decomposeMadda(w.text)}` : decomposeMadda(w.text);
  }
  return out.filter((a) => a.text || a.ended);
}

/** "Surah 31, ayah 19" / "Surah 104, ayat 1–2" — the snippet's accessible name. */
export function snippetLabel(ref: Pick<QuranRef, "surah" | "from_ayah" | "to_ayah">): string {
  return ref.from_ayah === ref.to_ayah
    ? `Surah ${ref.surah}, ayah ${ref.from_ayah}`
    : `Surah ${ref.surah}, ayat ${ref.from_ayah}–${ref.to_ayah}`;
}
