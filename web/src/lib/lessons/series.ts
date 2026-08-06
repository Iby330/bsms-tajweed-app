/** Display names for the `series_t` enum. Shared so the screens that show
 *  a lesson's series can't drift apart. */
export const SERIES_LABELS: Record<string, string> = {
  tajweed: "Tajweed",
  umm_al_kitab: "Umm al-Kitāb",
  tfp: "Ten Fundamental Principles",
  seerah: "Seerah",
};

/** Short forms for breadcrumbs and chips, where the full name is too long. */
export const SERIES_SHORT: Record<string, string> = {
  tajweed: "Tajweed",
  umm_al_kitab: "Umm al-Kitāb",
  tfp: "TFP",
  seerah: "Seerah",
};

/** One line of "what is this course", shown on the course cards. */
export const SERIES_BLURB: Record<string, string> = {
  tajweed: "The rules of recitation, week by week.",
  umm_al_kitab: "Surah Al-Fātiha, verse by verse.",
  tfp: "The ten principles every science rests on.",
  seerah: "The life of the Prophet ﷺ.",
};

/** Teaching order. Anything unlisted sorts last, alphabetically. */
export const SERIES_ORDER = ["tajweed", "umm_al_kitab", "tfp", "seerah"];

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
