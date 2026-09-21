/**
 * Which LETTERS each rule of Al-Ma'idah 5:95 actually sits on.
 *
 * ⚠️ NEEDS A TEACHER'S EYE BEFORE THIS GOES LIVE. Same warning as
 * maidah95.ts, and for the same reason: a mislabelled rule on a page selling
 * tajweed teaching is the worst error we could ship. What is different here is
 * the source — these spans were read off the Dar Al-Marifa colour-coded mushaf
 * (page ١٢٣, archive.org/details/QuranWithColourCodedTajweed_201303) rather
 * than off a transcript, and the colours in that scan were classified against
 * the mushaf's own printed legend swatches rather than by eye. That already
 * caught one error in maidah95.ts (see `s1-muttasil`). It does not make this a
 * qualified reading.
 *
 * ── Why this is a separate file ────────────────────────────────────────────
 * maidah95.ts says WHICH WORDS a rule covers, which is what a teacher checks
 * first. This says which letters inside those words carry it, which is what
 * the renderer needs in order to light a qaf rather than the whole of
 * تَقْتُلُوا۟. Keeping them apart means the letter marking can be reviewed as
 * one short list instead of hunting through six hundred lines of prose, and a
 * rule can exist before anyone has decided its exact letters.
 *
 * ── How a span is written ──────────────────────────────────────────────────
 * `t` is the letters AS THEY APPEAR in the word, so a reviewer reads
 * "قْ in تَقْتُلُوا۟" rather than a pair of integers. The baker finds that
 * substring and lights exactly those glyphs.
 *
 * `nth` disambiguates when the letters occur more than once in the word —
 * مِنكُم has two meems and the rule is about the LAST one, so it is
 * `{ w: 2, t: "م", nth: 1 }`. Without it the baker would silently light the
 * wrong meem, which is precisely the class of error this file exists to stop.
 * The baker throws if `t` does not occur at least `nth + 1` times.
 *
 * A rule spanning a word boundary — idgham, ikhfa' and iqlab across two words
 * — lists a span in each word. That is why `w` is an absolute word index
 * rather than an offset into the rule's own range.
 *
 * ── Marks come along ───────────────────────────────────────────────────────
 * Name the LETTER; the baker carries the colour onto the marks riding on it.
 * `{ w: 5, t: "م" }` for مِّثْلُ lights the meem, its shadda AND its kasra, the
 * way the mushaf prints the whole مِّ green. That is not decoration — the
 * shadda is what tells a reader the idgham is there, so leaving it uncoloured
 * would hide the evidence for the rule being marked.
 *
 * The extension stops at the next LETTER, so writing "ا" for فَجَزَآءٌ takes
 * the alif and its maddah and stops before the hamzah. If you ever need a
 * bare letter with its marks left out, that is not currently expressible —
 * say so and it can be added, rather than working around it with `nth`.
 *
 * Where a rule has NO entry here it falls back to lighting its whole word
 * span, and the geometry preview marks it "not yet narrowed to letters".
 */

export type LetterSpan = {
  /** Absolute index into the section's `words`. */
  w: number;
  /** The letters, exactly as they appear in that word. */
  t: string;
  /** Which occurrence, 0-based. Omit when `t` occurs once. */
  nth?: number;
};

/**
 * Keyed by `Rule.id`.
 *
 * Cases worth a teacher's attention specifically, because they are judgements
 * rather than transcriptions of the mushaf's colour:
 *
 *   · `s1-wasl` — the mushaf greys the LAM of ٱلَّذِينَ (assimilated into the
 *     dhal) and leaves the connecting hamzah black. We mark the hamzah here
 *     too, since it genuinely is not pronounced when continuing, but that is
 *     our call and not the mushaf's.
 *   · `s3-iqlab` — marked on the small high meem ۢ, which is the sign that
 *     records the iqlab, rather than on the tanween it converts.
 *   · The lam and raa quality rules (the heavy lam of Allah, the light raa)
 *     carry no mushaf colour; they render in the sage accent.
 */
export const LETTERS: Record<string, LetterSpan[]> = {
  /* ── s1 · يَـٰٓأَيُّهَا ٱلَّذِينَ ءَامَنُوا۟ لَا تَقْتُلُوا۟ ٱلصَّيْدَ وَأَنتُمْ حُرُمٌ ── */

  // The madd sign over the dagger alif — the mark the mushaf prints in red.
  "s1-muttasil": [{ w: 0, t: "ٰٓ" }],
  "s1-wasl": [{ w: 1, t: "ٱ" }],
  "s1-qalqalah": [{ w: 4, t: "قْ" }],
  "s1-leen": [{ w: 5, t: "يْ" }],
  "s1-ikhfa": [{ w: 6, t: "نت" }],
  // The tanween that merges into the waw opening the next section.
  "s1-idgham": [{ w: 7, t: "ٌ" }],

  /* ── s2 · وَمَن قَتَلَهُۥ مِنكُم مُّتَعَمِّدًا فَجَزَآءٌ مِّثْلُ مَا قَتَلَ مِنَ ٱلنَّعَمِ ── */

  "s2-ikhfa-1": [{ w: 0, t: "ن" }],
  "s2-ikhfa-2": [{ w: 2, t: "نك" }],
  // The LAST meem of مِنكُم — hence nth — merging into the meem of مُّتَعَمِّدًا.
  "s2-idgham-mim": [
    { w: 2, t: "م", nth: 1 },
    { w: 3, t: "م" },
  ],
  // The doubled meem mid-word, not the one that opens it.
  "s2-ghunnah": [{ w: 3, t: "م", nth: 1 }],
  // Alif + maddah, DECOMPOSED (U+0627 U+0653). Not the precomposed U+0622:
  // Uthmanic Hafs has no glyph for that codepoint, so the word rendered with a
  // missing letter until this was fixed in maidah95.ts. The baker now refuses
  // to bake a .notdef, so it cannot come back quietly.
  // The mushaf prints this madd bright red — wajib muttasil.
  "s2-muttasil": [{ w: 4, t: "آ" }],
  "s2-idgham-2": [
    { w: 4, t: "ٌ" },
    { w: 5, t: "م" },
  ],

  /* ── s3 · يَحْكُمُ بِهِۦ ذَوَا عَدْلٍ مِّنكُمْ هَدْيًۢا بَـٰلِغَ ٱلْكَعْبَةِ ── */

  "s3-qalqalah": [{ w: 3, t: "دْ" }],
  "s3-idgham": [
    { w: 3, t: "ٍ" },
    { w: 4, t: "م" },
  ],
  "s3-ikhfa": [{ w: 4, t: "نك" }],
  "s3-izhar-shafawi": [{ w: 4, t: "مْ" }],
  "s3-qalqalah-2": [{ w: 5, t: "دْ" }],
  // The small high meem that records the iqlab.
  "s3-iqlab": [{ w: 5, t: "ۢ" }],

  /* ── s4 · أَوْ كَفَّـٰرَةٌ طَعَامُ مَسَـٰكِينَ أَوْ عَدْلُ ذَٰلِكَ صِيَامًا لِّيَذُوقَ وَبَالَ أَمْرِهِۦ ── */

  "s4-raa-heavy": [{ w: 1, t: "ر" }],
  "s4-ikhfa-heavy": [{ w: 1, t: "ٌ" }],
  "s4-qalqalah": [{ w: 5, t: "دْ" }],
  "s4-idgham-lam": [
    { w: 7, t: "ً" },
    { w: 8, t: "ل" },
  ],
  "s4-raa-light": [{ w: 10, t: "ر" }],

  /* ── s5 · عَفَا ٱللَّهُ عَمَّا سَلَفَ ── */

  // Two sukun-bearing letters meeting across the word join.
  "s5-sakinayn": [
    { w: 0, t: "ا" },
    { w: 1, t: "ٱ" },
  ],
  // The doubled lam of the Name — the second lam, the one carrying the shadda.
  "s5-lam-heavy": [{ w: 1, t: "ل", nth: 1 }],
  "s5-ghunnah": [{ w: 2, t: "م" }],
  "s5-tabiee": [{ w: 2, t: "ا" }],

  /* ── s6 · وَمَنْ عَادَ فَيَنتَقِمُ ٱللَّهُ مِنْهُ ── */

  "s6-izhar": [{ w: 0, t: "نْ" }],
  "s6-ikhfa": [{ w: 2, t: "نت" }],
  "s6-lam-heavy": [{ w: 3, t: "ل", nth: 1 }],
  "s6-izhar-2": [{ w: 4, t: "نْ" }],

  /* ── s7 · وَٱللَّهُ عَزِيزٌ ذُو ٱنتِقَامٍ ── */

  "s7-lam-heavy": [{ w: 0, t: "ل", nth: 1 }],
  "s7-ikhfa-light": [{ w: 1, t: "ٌ" }],
  "s7-dropped": [{ w: 2, t: "و" }],
  "s7-ikhfa": [{ w: 3, t: "نت" }],
  // The alif stretched because the reciter stops on the meem after it.
  "s7-arid": [{ w: 3, t: "ا" }],
};
