/** The mistake vocabulary for peer review. Curated, not exhaustive — chips
 *  must be scannable mid-recitation. Stored values are the ids; labels are
 *  presentation. Changing an id orphans stored rows — add, don't rename. */

export const CATEGORIES = [
  { id: "hifz", label: "Hifz" },
  { id: "tajweed", label: "Tajweed" },
  { id: "makhraj", label: "Makhraj" },
  { id: "fluency", label: "Fluency" },
] as const;
export type Category = (typeof CATEGORIES)[number]["id"];
export const CATEGORY_IDS: readonly string[] = CATEGORIES.map((c) => c.id);

export const DETAILS: Record<Exclude<Category, "makhraj">, { id: string; label: string }[]> = {
  hifz: [
    { id: "forgot", label: "Forgot the word" },
    { id: "swapped", label: "Swapped / wrong word" },
    { id: "added", label: "Added a word" },
  ],
  tajweed: [
    { id: "ikhfa", label: "Ikhfa" },
    { id: "idgham", label: "Idgham" },
    { id: "iqlab", label: "Iqlab" },
    { id: "izhar", label: "Izhar" },
    { id: "qalqalah", label: "Qalqalah" },
    { id: "madd", label: "Madd length" },
    { id: "ghunnah", label: "Ghunnah" },
    { id: "tafkhim", label: "Heavy / light (tafkhim–tarqiq)" },
  ],
  fluency: [
    { id: "hesitation", label: "Hesitation" },
    { id: "repetition", label: "Repetition" },
  ],
};

/** Session-level observations that aren't anchored to one word. */
export const SESSION_FLAGS = [
  { id: "weak_hifz", label: "Weak hifz overall" },
  { id: "halting", label: "Halting — needs more revision" },
  { id: "strong", label: "Strong recitation" },
] as const;

const LETTER_NORMALISE: Record<string, string> = { "ٱ": "ا", "أ": "ا", "إ": "ا", "آ": "ا" };
const ARABIC_LETTER = /[ء-يٱ]/; // base letters only — tashkeel is ً+

/** Base letters of a word, reading order, deduped — the makhraj chip list. */
export function lettersOf(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ch of text) {
    if (!ARABIC_LETTER.test(ch)) continue;
    const base = LETTER_NORMALISE[ch] ?? ch;
    if (!seen.has(base)) {
      seen.add(base);
      out.push(base);
    }
  }
  return out;
}

/** Human label for a stored (category, detail) pair. */
export function detailLabel(category: Category, detail: string | null): string {
  const cat = CATEGORIES.find((c) => c.id === category)?.label ?? category;
  if (!detail) return cat;
  if (category === "makhraj") return `Makhraj of ${detail}`;
  const d = DETAILS[category as Exclude<Category, "makhraj">]?.find((x) => x.id === detail);
  return d ? `${cat} — ${d.label}` : cat;
}

export function flagLabel(flag: string): string {
  return SESSION_FLAGS.find((f) => f.id === flag)?.label ?? flag;
}
