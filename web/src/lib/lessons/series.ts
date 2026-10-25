/** Display names for the `series_t` enum. Shared so the screens that show
 *  a lesson's series can't drift apart. */
export const SERIES_LABELS: Record<string, string> = {
  tajweed: "Tajweed",
  umm_al_kitab: "Umm al-Kitāb",
  tfp: "Ten Fundamental Principles",
  seerah: "Sahabah Stories",
  qaidah: "Qāʿidah Nūrāniyyah",
  seerah_reflections: "Seerah",
};

/** Short forms for breadcrumbs and chips, where the full name is too long. */
export const SERIES_SHORT: Record<string, string> = {
  tajweed: "Tajweed",
  umm_al_kitab: "Umm al-Kitāb",
  tfp: "TFP",
  seerah: "Sahabah",
  qaidah: "Qāʿidah",
  seerah_reflections: "Seerah",
};

/** One line of "what is this course", shown on the course cards. */
export const SERIES_BLURB: Record<string, string> = {
  tajweed: "The rules of recitation, week by week.",
  umm_al_kitab: "Surah Al-Fātiha, verse by verse.",
  tfp: "The ten principles every science rests on.",
  seerah: "Stories of the Companions.",
  qaidah: "The Arabic letters: how each one is said, and how to tell them apart.",
  seerah_reflections: "Reflections on the life of the Prophet ﷺ.",
};

/** Series the programme plans to add but holds nothing for yet. Empty since
 *  Sahabah Stories (the `seerah` key) became a course in every class's year,
 *  2026-10-15; kept so the next planned series has somewhere to go. */
export const SERIES_COMING_SOON = new Set<string>();

/** Teaching order. Anything unlisted sorts last, alphabetically. Sahabah
 *  Stories (`seerah`) and Seerah (`seerah_reflections`, 0123) are left off:
 *  neither is a course, their videos are in every class's Resources
 *  (2026-10-25), so the catalogue makes no empty block for them. */
export const SERIES_ORDER = ["tajweed", "umm_al_kitab", "tfp", "qaidah"];

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
