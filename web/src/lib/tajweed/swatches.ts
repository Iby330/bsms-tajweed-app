/**
 * The tajweed colour key, as the Madinah mushaf uses it, lifted for navy.
 *
 * ── Where these came from ──────────────────────────────────────────────────
 * Not picked by eye and not taken from a web palette. Each `mushaf` value was
 * sampled from the legend swatches printed at the foot of page ١٢٣ of the Dar
 * Al-Marifa colour-coded mushaf — the same page that carries this ayah —
 * scanned at archive.org/details/QuranWithColourCodedTajweed_201303. So the
 * hues are the ones a student who reads that mushaf already knows.
 *
 * ── Why they are not used verbatim ─────────────────────────────────────────
 * That mushaf prints on cream. We paint on navy `#00004D`, and three of the
 * eight fall below 4.5:1 there — the slate of tafkhim ar-raa is 3.22:1, which
 * is close to invisible. Those three are lifted in Oklab: hue held exactly,
 * chroma nudged up ~6% so lifting does not wash them out, lightness raised
 * only until it clears the floor. The other five are printed untouched.
 *
 * The floor is a FLOOR, not a target, and that distinction matters. An early
 * version drove all eight to the same 7:1 and it was wrong: the mushaf
 * separates its two reds BY LIGHTNESS (dark `#AE4B43` against bright
 * `#EF5442`), so equalising contrast collapsed them onto one plane and left
 * them ΔE 0.046 apart — a confusion between a 6-count madd and a 4-count one.
 * Lifting only what fails preserves the relationships the source relies on.
 *
 * Two pairs stay close even so — slate/blue at ΔE 0.050, and the two reds at
 * 0.075. They are equally close in the mushaf itself; this is inherited, not
 * introduced. The hero never leans on colour alone to tell them apart: the
 * legend entry for the live rule lights up and names it.
 *
 * ── What is NOT in here ────────────────────────────────────────────────────
 * The mushaf colours eight things. Our rule set names thirty-six, including
 * rules such as the heavy lam of Allah, which that mushaf leaves black. Those return `null` from `swatchFor` and are drawn in the sage
 * accent instead, so the hero never invents a colour the mushaf would
 * contradict. See `swatchFor` for the mapping and its uncertain cases.
 */

export type SwatchKey =
  | "maddLazim"
  | "maddWajib"
  | "maddJaiz"
  | "maddTabee"
  | "ikhfa"
  | "idgham"
  | "raa"
  | "qalqalah";

export type Swatch = {
  /** As printed in the mushaf's own legend. */
  mushaf: string;
  /** What we paint on navy. Equal to `mushaf` where that already clears 4.5:1. */
  hex: string;
  /** Contrast of `hex` on #00004D. */
  onNavy: number;
  en: string;
  /**
   * For the phone key, where two columns of the full names do not fit at a
   * size anyone can read. Still names the RULE — never just a colour.
   */
  short: string;
  ar: string;
};

export const SWATCH: Record<SwatchKey, Swatch> = {
  maddLazim: {
    mushaf: "#AE4B43",
    hex: "#C75B52",
    onNavy: 4.55,
    en: "Madd Lazim — 6 counts",
    short: "Madd, 6",
    ar: "مدّ ٦ حركات لزوماً",
  },
  maddWajib: {
    mushaf: "#EF5442",
    hex: "#EF5442",
    onNavy: 5.43,
    en: "Madd Wajib — 4 or 5 counts",
    short: "Madd, 4–5",
    ar: "مدّ واجب ٤ أو ٥ حركات",
  },
  maddJaiz: {
    mushaf: "#EF8B44",
    hex: "#EF8B44",
    onNavy: 7.63,
    en: "Madd Ja'iz — 2, 4 or 6",
    short: "Madd, 2/4/6",
    ar: "مدّ ٢ أو ٤ أو ٦ جوازاً",
  },
  maddTabee: {
    mushaf: "#C49A47",
    hex: "#C49A47",
    onNavy: 7.28,
    en: "Madd — 2 counts",
    short: "Madd, 2",
    ar: "مدّ حركتان",
  },
  ikhfa: {
    mushaf: "#58855B",
    hex: "#57875A",
    onNavy: 4.51,
    en: "Ikhfa' and ghunnah",
    short: "Ikhfa' / ghunnah",
    ar: "إخفاء ومواقع الغُنَّة",
  },
  idgham: {
    mushaf: "#9A9585",
    hex: "#ABA58C",
    onNavy: 7.67,
    en: "Idgham, and what is not pronounced",
    short: "Idgham / silent",
    ar: "ادغام، وما لا يُلفظ",
  },
  raa: {
    mushaf: "#4B6782",
    hex: "#607F9C",
    onNavy: 4.52,
    en: "Tafkhim of the raa",
    short: "Heavy raa",
    ar: "تفخيم الراء",
  },
  qalqalah: {
    mushaf: "#4C87BC",
    hex: "#4C87BC",
    onNavy: 4.97,
    en: "Qalqalah",
    short: "Qalqalah",
    ar: "قلقلة",
  },
};

/** The neutral accent for rules the mushaf does not colour. */
export const SAGE = "#B2C58C";

type RuleLike = {
  id: string;
  kind: string;
  name: string;
  counts?: string;
};

/**
 * Which of the eight a rule paints with, or null for "the mushaf leaves this
 * black, so we use the sage accent".
 *
 * ⚠️ The madd cases key off `counts`, because the mushaf's four madd colours
 * are distinctions of LENGTH, not of name — 6 counts is dark red whatever you
 * call the rule. Any rule whose `counts` string changes will change colour, so
 * keep those strings honest.
 *
 * Cases a teacher should look at specifically, flagged because the mapping is
 * a judgement rather than a reading of the legend:
 *   · idgham WITH ghunnah is green here, not grey — it carries a ghunnah, and
 *     the mushaf greens ghunnah. Idgham without ghunnah, and silent letters,
 *     stay grey.
 *   · iqlab is green: the meem it converts to is held with ghunnah.
 *   · izhar returns null. Izhar is the ABSENCE of a merge, and the mushaf
 *     leaves it uncoloured; colouring it would teach the opposite of the rule.
 */
export function swatchFor(rule: RuleLike): SwatchKey | null {
  const { kind, counts, name } = rule;

  if (kind === "madd") {
    if (counts?.startsWith("6")) return "maddLazim";
    // Muttasil, the obligatory madd. Written "4 or 5 counts" or, as the
    // teacher simplified it for the hero, "4 counts" — both the mushaf's red.
    if (counts?.startsWith("4")) return "maddWajib";
    if (counts?.startsWith("2, 4 or 6") || counts?.startsWith("2 or 4")) return "maddJaiz";
    if (counts?.startsWith("2")) return "maddTabee";
    return null; // e.g. "Madd dropped" — nothing is stretched, nothing is coloured
  }

  if (kind === "ghunnah" || kind === "ikhfa" || kind === "iqlab") return "ikhfa";
  if (kind === "qalqalah") return "qalqalah";
  if (kind === "raa") return name.includes("Mufakhkhamah") ? "raa" : null;
  if (kind === "izhar") return null;

  if (kind === "idgham") return name.includes("bila Ghunnah") ? "idgham" : "ikhfa";

  // Hamzat al-wasl and lam shamsiyyah are both "not pronounced" — the grey.
  if (kind === "hamzah") return name.includes("Wasl") ? "idgham" : null;
  if (kind === "lam") return name.includes("Shamsiyyah") ? "idgham" : null;

  return null; // makhraj, and anything new
}

/**
 * What the key calls a rule.
 *
 * The key names RULES, not the mushaf's colour groups. It used to show the
 * eight printed swatches, which made Idgham, Iqlab, Ikhfa' and Ghunnah all
 * light up as "Ikhfa' and ghunnah", put Hamzat al-Wasl under "what is not
 * pronounced", and left rules the mushaf does not colour (the heavy lam,
 * Idhar) with no entry at all. Worse, two rules sharing a colour shared one
 * entry, so a Qalqalah on word 4 and another on word 6 kept the key lit
 * through word 5. The teacher's review asked for each rule by name; the
 * letters keep their mushaf colours.
 *
 * Names follow the teacher's usage: Madd Asli rather than Tabi'i, Idhar with a
 * D, both idghams of the nun simply "Idgham", every variant of ikhfa' simply
 * "Ikhfa'".
 */
export function keyLabel(rule: RuleLike): string {
  const { kind, name, counts } = rule;
  switch (kind) {
    case "madd":
      if (name.includes("Muttasil")) return counts ? `Madd Muttasil · ${counts}` : "Madd Muttasil";
      if (name.includes("Leen")) return "Madd Leen";
      if (name.includes("Asli")) return "Madd Asli · 2 counts";
      if (name.includes("'Arid")) return "Madd 'Arid";
      return name;
    case "ikhfa":
      return "Ikhfa'";
    case "ghunnah":
      return "Ghunnah";
    case "iqlab":
      return "Iqlab";
    case "qalqalah":
      return "Qalqalah";
    case "idgham":
      return name.includes("Shafawi") ? "Idgham Shafawi" : "Idgham";
    case "izhar":
      return name.includes("Shafawi") ? "Idhar Shafawi" : "Idhar Halqi";
    case "hamzah":
      return name.includes("Wasl") ? "Hamzat al-Wasl" : name;
    case "lam":
      return name.includes("heavy") ? "Heavy lam" : name;
    case "raa":
      return name.includes("Mufakhkhamah") ? "Heavy raa" : "Light raa";
    default:
      return name;
  }
}
