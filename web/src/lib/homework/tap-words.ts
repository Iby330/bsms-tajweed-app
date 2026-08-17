/**
 * "Tap the rule" questions — pure, no IO.
 *
 * A tap-the-rule question is a `checkbox` whose options are the WORDS of a
 * passage rather than answers to pick between: option 7 is the seventh word of
 * An-Naba' 12–18, and the ones flagged correct are where the rule occurs. That
 * shape is deliberate — it needs no new column, no new enum value, and no new
 * marking code, because `per_option` scoring already awards a share per correct
 * pick and cancels the wrong ones.
 *
 * The cost of riding on `checkbox` is that a question has to be RECOGNISED
 * rather than declared, which is what this module does. The signal is the
 * label: every option is a word locator, `surah:ayah:position`. Ordinary
 * checkbox options are prose ("Idghām", "Option 3"), so the two cannot be
 * confused, and the length floor keeps a three-option question with unlucky
 * labels from being drawn as a mushaf.
 *
 * If this graduates from a spike, `qtype` should gain a real `tap_words` value
 * and `isTapWords` becomes a comparison instead of a heuristic. Everything else
 * here survives that change unaltered.
 */

export type TapOption = {
  position: number;
  label: string;
  /** The word itself. Absent only if a question was built wrong. */
  value?: string;
  /** Teacher-side only — the student RPC strips it. */
  correct?: boolean;
};

export type TapAyah = { surah: number; ayah: number; words: TapOption[] };

/** `78:14:3` — surah, ayah, word position. */
const LOCATOR = /^(\d+):(\d+):(\d+)$/;

/** Below this, a run of locator-shaped labels is more likely a coincidence
 *  than a passage. A real passage is dozens of words. */
const MIN_WORDS = 5;

export function parseLocator(
  label: string,
): { surah: number; ayah: number; position: number } | null {
  const m = LOCATOR.exec(label.trim());
  if (!m) return null;
  return { surah: Number(m[1]), ayah: Number(m[2]), position: Number(m[3]) };
}

/** True when these options are a passage to tap rather than answers to pick. */
export function isTapWords(options: TapOption[] | null | undefined): boolean {
  if (!options || options.length < MIN_WORDS) return false;
  return options.every((o) => parseLocator(o.label) !== null);
}

/**
 * The passage grouped into ayahs, in reading order.
 *
 * Ordered by the option position rather than by the locator: the position is
 * what the student's answer refers to and what the marking scores, so a
 * passage that was built out of order still renders in the order it is marked
 * in. Anything whose label will not parse is dropped rather than guessed at.
 */
export function tapAyahs(options: TapOption[]): TapAyah[] {
  const out: TapAyah[] = [];
  for (const option of [...options].sort((a, b) => a.position - b.position)) {
    const loc = parseLocator(option.label);
    if (!loc) continue;
    const last = out[out.length - 1];
    if (last && last.surah === loc.surah && last.ayah === loc.ayah) {
      last.words.push(option);
    } else {
      out.push({ surah: loc.surah, ayah: loc.ayah, words: [option] });
    }
  }
  return out;
}

/** Arabic-Indic ayah number, as the mushaf prints it: 14 → ١٤. */
export function arabicNumber(n: number): string {
  return String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
}
