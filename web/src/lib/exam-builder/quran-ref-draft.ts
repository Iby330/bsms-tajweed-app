/**
 * The "Typeset ayah" inputs (surah, from ayah, to ayah, and optionally only
 * some words) as the teacher types them, read into a `QuranRef` with a plain
 * reason when they do not make one. Pure; the item editor and the new
 * question form share it.
 */
import { surahByNumber } from "@/lib/quran/surahs";
import { isQuranRef } from "./quran-lines";
import type { QuranRef } from "./types";

export type RefDraft = { surah: string; from: string; to: string; fromWord: string; toWord: string };

export const EMPTY_DRAFT: RefDraft = { surah: "", from: "", to: "", fromWord: "", toWord: "" };

export function draftFromRef(ref: QuranRef | null | undefined): RefDraft {
  if (!ref) return EMPTY_DRAFT;
  return {
    surah: String(ref.surah),
    from: String(ref.from_ayah),
    to: ref.to_ayah === ref.from_ayah ? "" : String(ref.to_ayah),
    fromWord: ref.from_word != null ? String(ref.from_word) : "",
    toWord: ref.to_word != null ? String(ref.to_word) : "",
  };
}

const whole = (s: string): number | null => (/^\s*\d+\s*$/.test(s) ? Number(s) : null);

export type DraftRead = { ok: true; ref: QuranRef } | { ok: false; error: string };

/** "31 · Luqman", or null when the number is not a surah. */
export function surahTag(surah: string): string | null {
  const n = whole(surah);
  const s = n != null ? surahByNumber(n) : undefined;
  return s ? `${s.number} · ${s.name}` : null;
}

export function readDraft(d: RefDraft): DraftRead {
  const fail = (error: string): DraftRead => ({ ok: false, error });
  if (!d.surah.trim()) return fail("Type the surah number, from 1 to 114.");
  const surahN = whole(d.surah);
  const surah = surahN != null ? surahByNumber(surahN) : undefined;
  if (!surah) return fail("Surahs are numbered 1 to 114.");
  if (!d.from.trim()) return fail("Type the ayah it starts at.");
  const from = whole(d.from);
  if (from == null || from < 1) return fail("The first ayah must be a whole number.");
  const to = d.to.trim() ? whole(d.to) : from;
  if (to == null || to < 1) return fail("The last ayah must be a whole number.");
  if (from > surah.ayahs || to > surah.ayahs) {
    return fail(`${surah.name} has ${surah.ayahs} ayat, so there is no ayah ${Math.max(from, to)}.`);
  }
  if (to < from) return fail("The last ayah comes before the first.");
  const ref: QuranRef = { surah: surah.number, from_ayah: from, to_ayah: to };
  if (d.fromWord.trim()) {
    const w = whole(d.fromWord);
    if (w == null || w < 1) return fail("The first word must be a whole number, counting from 1.");
    ref.from_word = w;
  }
  if (d.toWord.trim()) {
    const w = whole(d.toWord);
    if (w == null || w < 1) return fail("The last word must be a whole number, counting from 1.");
    ref.to_word = w;
  }
  if (from === to && ref.from_word != null && ref.to_word != null && ref.to_word < ref.from_word) {
    return fail("The last word comes before the first.");
  }
  if (!isQuranRef(ref)) return fail("That isn't an ayah range.");
  return { ok: true, ref };
}
