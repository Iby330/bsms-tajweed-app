import { ayahKey, markKey, wordKey, type QuranWord } from "@/lib/quran/mushaf";
import { detailLabel } from "./mistake-taxonomy";
import { heatClass, wordHeat, type MistakeRow } from "./mistakes";

export type WordHistoryEntry = { label: string; note: string | null; date: string };

export type HeatSpread = {
  heat: Record<string, string>;                 // wordKey → tint class
  history: Record<string, WordHistoryEntry[]>;  // wordKey → entries, newest first
};

/**
 * Mistakes → what the mushaf paints and what a tap on a word explains.
 *
 * wordHeat keys by markKey, so an ayah-scoped mistake lands on the ayah.
 * Spread it back over the words given and ADD the two: a word
 * mis-read inside an ayah that was also forgotten is hotter than either on
 * its own, which a `??` fallback in the reader would quietly hide. The
 * history gets the same spread, so tapping any word of a forgotten ayah —
 * including the end marker — explains why it is hot.
 */
export function spreadHeat(words: QuranWord[], mistakes: MistakeRow[], now: Date): HeatSpread {
  const raw = wordHeat(mistakes, now);
  const heat: Record<string, string> = {};
  for (const w of words) {
    const total = (raw[wordKey(w)] ?? 0) + (raw[ayahKey(w)] ?? 0);
    if (total > 0) heat[wordKey(w)] = heatClass(total);
  }

  const byTarget: Record<string, WordHistoryEntry[]> = {};
  for (const m of mistakes) {
    const k = markKey({ surah: m.surah_number, ayah: m.ayah_number, position: m.word_position });
    (byTarget[k] ??= []).push({
      label: detailLabel(m.category, m.detail) + (m.word_position === null ? " · whole ayah" : ""),
      note: m.note,
      date: m.created_at,
    });
  }
  const history: Record<string, WordHistoryEntry[]> = {};
  for (const w of words) {
    const entries = [...(byTarget[wordKey(w)] ?? []), ...(byTarget[ayahKey(w)] ?? [])];
    if (entries.length) history[wordKey(w)] = entries.sort((a, b) => b.date.localeCompare(a.date));
  }
  return { heat, history };
}
