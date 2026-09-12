/** The mistake vocabulary for peer review. Curated, not exhaustive — chips
 *  must be scannable mid-recitation. Stored values are the ids; labels are
 *  presentation. Changing an id orphans stored rows — add, don't rename. */

// Labels say "Hifdh" (the 2026 redesign's spelling); stored ids keep the
// original "hifz" slug — renaming an id orphans stored rows.
export const CATEGORIES = [
  { id: "hifz", label: "Hifdh" },
  { id: "tajweed", label: "Tajweed" },
  { id: "makhraj", label: "Makhraj" },
] as const;
export type Category = (typeof CATEGORIES)[number]["id"];
export const CATEGORY_IDS: readonly string[] = CATEGORIES.map((c) => c.id);

export const DETAILS: Record<Exclude<Category, "makhraj">, { id: string; label: string }[]> = {
  // Scope-neutral wording on purpose: the same detail describes one word or
  // a whole ayah (tapping the end marker), and patterns aggregate across
  // both, so "Forgot the word" would misname half of what it counts.
  hifz: [
    { id: "forgot", label: "Forgot it" },
    { id: "swapped", label: "Swapped / wrong" },
    { id: "added", label: "Added extra" },
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
};

/**
 * Retired from the picker but still rendered. The DB check constraint on
 * revision_mistakes.category is deliberately NOT narrowed to match this
 * list: narrowing it would fail validation against rows already logged, and
 * silently dropping a category would surface a raw slug like "fluency" in a
 * student's feedback. Selection reads CATEGORIES / DETAILS; display reads
 * these too. Retire by moving an entry here — never by deleting it.
 */
const RETIRED_CATEGORIES: { id: string; label: string }[] = [
  { id: "fluency", label: "Fluency" },
];
const RETIRED_DETAILS: Record<string, { id: string; label: string }[]> = {
  fluency: [
    { id: "hesitation", label: "Hesitation" },
    { id: "repetition", label: "Repetition" },
  ],
};

/** Session-level observations that aren't anchored to one word. */
export const SESSION_FLAGS = [
  { id: "weak_hifz", label: "Weak hifdh overall" },
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

/** Human label for a stored (category, detail) pair. Accepts retired
 *  categories so old rows keep reading properly. */
export function detailLabel(category: Category | string, detail: string | null): string {
  const cat =
    CATEGORIES.find((c) => c.id === category)?.label
    ?? RETIRED_CATEGORIES.find((c) => c.id === category)?.label
    ?? category;
  if (!detail) return cat;
  if (category === "makhraj") return `Makhraj of ${detail}`;
  const list =
    DETAILS[category as Exclude<Category, "makhraj">] ?? RETIRED_DETAILS[category];
  const d = list?.find((x) => x.id === detail);
  return d ? `${cat} — ${d.label}` : cat;
}

export function flagLabel(flag: string): string {
  return SESSION_FLAGS.find((f) => f.id === flag)?.label ?? flag;
}
