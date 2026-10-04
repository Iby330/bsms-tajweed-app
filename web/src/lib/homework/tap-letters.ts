/**
 * "Tap the letters" questions — pure, no IO.
 *
 * Tap-the-rule (tap-words.ts) works a word at a time, but some rules live in
 * a single letter: the heavy letters of ٱلصِّرَٰطَ are its ص and ط, not the
 * whole word. These are the same `checkbox` shape one level down: one option
 * per LETTER, labelled `L:surah:ayah:word:letter`, its value the letter with
 * its marks. Scored `per_option` like the words.
 *
 * Unlike a tapped word, a letter can't be drawn from the mushaf's page font —
 * a printed glyph is a whole word — so the passage is set in Uthmanic Hafs,
 * each letter its own span inside its word so the word still joins.
 */

export type LetterOption = {
  position: number;
  label: string;
  value?: string;
  /** Teacher-side only — the student RPC strips it. */
  correct?: boolean;
};

export type TapLetterWord = {
  surah: number;
  ayah: number;
  word: number;
  letters: LetterOption[];
  /** The last word of its ayah in this passage: the ayah number follows it. */
  endsAyah: boolean;
};

const LOCATOR = /^L:(\d+):(\d+):(\d+):(\d+)$/;

export function parseLetter(label: string): { surah: number; ayah: number; word: number; letter: number } | null {
  const m = LOCATOR.exec(label.trim());
  if (!m) return null;
  return { surah: Number(m[1]), ayah: Number(m[2]), word: Number(m[3]), letter: Number(m[4]) };
}

/** A real passage is a verse or more — a dozen letters at the least. */
const MIN_LETTERS = 5;

export function isTapLetters(options: LetterOption[] | null | undefined): boolean {
  return !!options && options.length >= MIN_LETTERS && options.every((o) => parseLetter(o.label) !== null);
}

/** The passage as words of letters, in the order the options are marked in. */
export function tapLetterWords(options: LetterOption[]): TapLetterWord[] {
  const out: TapLetterWord[] = [];
  for (const option of [...options].sort((a, b) => a.position - b.position)) {
    const loc = parseLetter(option.label);
    if (!loc) continue;
    const last = out[out.length - 1];
    if (last && last.surah === loc.surah && last.ayah === loc.ayah && last.word === loc.word) {
      last.letters.push(option);
    } else {
      if (last) last.endsAyah = last.ayah !== loc.ayah || last.surah !== loc.surah;
      out.push({ surah: loc.surah, ayah: loc.ayah, word: loc.word, letters: [option], endsAyah: false });
    }
  }
  if (out.length) out[out.length - 1].endsAyah = true;
  return out;
}
