/** Display names for the `series_t` enum. Shared so the screens that show
 *  a lesson's series can't drift apart. */
export const SERIES_LABELS: Record<string, string> = {
  tajweed: "Tajweed",
  umm_al_kitab: "Umm al-Kitāb",
  tfp: "Ten Fundamental Principles",
  seerah: "Sahabah Stories",
  qaidah: "Qāʿidah Nūrāniyyah",
};

/** Short forms for breadcrumbs and chips, where the full name is too long. */
export const SERIES_SHORT: Record<string, string> = {
  tajweed: "Tajweed",
  umm_al_kitab: "Umm al-Kitāb",
  tfp: "TFP",
  seerah: "Sahabah",
  qaidah: "Qāʿidah",
};

/** One line of "what is this course", shown on the course cards. */
export const SERIES_BLURB: Record<string, string> = {
  tajweed: "The rules of recitation, week by week.",
  umm_al_kitab: "Surah Al-Fātiha, verse by verse.",
  tfp: "The ten principles every science rests on.",
  seerah: "Stories of the Companions.",
  qaidah: "The Arabic letters: how each one is said, and how to tell them apart.",
};

/** Series the programme plans to add but holds nothing for yet. The `seerah`
 *  enum value is kept as the key; the series it names is Sahabah Stories. */
export const SERIES_COMING_SOON = new Set(["seerah"]);

/** Teaching order. Anything unlisted sorts last, alphabetically. */
export const SERIES_ORDER = ["tajweed", "umm_al_kitab", "tfp", "seerah", "qaidah"];

export function seriesLabel(key: string): string {
  return SERIES_LABELS[key] ?? key;
}

export function seriesShort(key: string): string {
  return SERIES_SHORT[key] ?? SERIES_LABELS[key] ?? key;
}

export function seriesBlurb(key: string): string {
  return SERIES_BLURB[key] ?? "";
}

export function seriesRank(key: string): number {
  const i = SERIES_ORDER.indexOf(key);
  return i === -1 ? SERIES_ORDER.length : i;
}

/** URL segment ⇄ series key. The enum values are already slug-safe. */
export function isSeriesKey(value: string): boolean {
  return /^[a-z_]+$/.test(value);
}
