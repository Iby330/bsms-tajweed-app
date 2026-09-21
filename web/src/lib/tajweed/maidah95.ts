/**
 * Al-Ma'idah 5:95, marked up rule by rule.
 *
 * This verse is the one tajweed teachers reach for when they want to test a
 * student on everything at once — it carries something like 95% of the rules
 * of Hafs 'an 'Asim in a single ayah, which is why it anchors the landing
 * page. The seven sections below are the seven the Arabic101 lesson breaks it
 * into, in the same order.
 *
 * ⚠️ NEEDS A TEACHER'S EYE BEFORE THIS GOES LIVE. The rule marking was
 * derived from the lesson's English transcript, whose transliteration is
 * garbled in places, and reconciled against the Uthmani text. It is careful,
 * but it is not a qualified reading. Every `Rule` below should be confirmed
 * by one of the teachers, and this comment deleted when it has been. A
 * mislabelled rule on a page selling tajweed teaching is the worst kind of
 * error we could ship.
 *
 * ── Shape ──────────────────────────────────────────────────────────────
 * A rule points at WORDS, never at character offsets. Offsets into Arabic
 * are miserable to author by hand and impossible to review — one combining
 * mark miscounted and the highlight lands on the wrong letter. The renderer
 * derives offsets from `words` at runtime instead, so what a teacher reads
 * here is "this rule covers words 5 to 6", which they can actually check.
 *
 * Rules spanning two words (idgham, iqlab, ikhfa' across a word boundary)
 * are exactly why `from` and `to` exist. Most rules set them equal.
 */

export type RuleKind =
  | "madd"
  | "ghunnah"
  | "qalqalah"
  | "idgham"
  | "ikhfa"
  | "izhar"
  | "iqlab"
  | "lam"
  | "raa"
  | "makhraj"
  | "hamzah";

export type Rule = {
  /** Stable id, used as the React key and for the tap-to-reveal state. */
  id: string;
  kind: RuleKind;
  /** How a teacher would name it in English. */
  name: string;
  /** The same name in Arabic, shown small beside it. */
  arabic: string;
  /** One line a student can act on. Kept short enough to read in the 700ms it is on screen. */
  gloss: string;
  /** Index into the section's `words`, inclusive at both ends. */
  from: number;
  to: number;
  /** Only when the rule has a length: "2 counts", "4 or 5 counts". */
  counts?: string;
  /**
   * True when the rule only applies if the reciter STOPS here, or only if
   * they CONTINUE. The renderer marks these with a lighter callout, because
   * they are conditional rather than always-on.
   */
  condition?: "on stopping" | "on continuing";
};

export type Section = {
  id: string;
  /**
   * One word per entry, in reading order (right to left on screen). The
   * renderer joins these with a single space into ONE text node — never one
   * element per word — because splitting Arabic across elements breaks
   * cursive joining and sends the marks adrift. Positions come from Range
   * measurement over that single node.
   */
  words: string[];
  /** Plain English, for the line under the verse. Not a claim to be a translation of record. */
  english: string;
  rules: Rule[];
};

export const MAIDAH_95: readonly Section[] = [
  {
    id: "s1",
    words: [
      "يَـٰٓأَيُّهَا",
      "ٱلَّذِينَ",
      "ءَامَنُوا۟",
      "لَا",
      "تَقْتُلُوا۟",
      "ٱلصَّيْدَ",
      "وَأَنتُمْ",
      "حُرُمٌ",
    ],
    english: "You who believe, do not kill game while you are in a state of ihram.",
    rules: [
      {
        /* Corrected from "s1-munfasil". The transcript this file was first
           built from called it munfasil — separated — but in Uthmani
           orthography يَـٰٓأَيُّهَا is written as ONE word, so the madd letter
           and the hamzah that follows it are inside the same word, which is
           the definition of muttasil. The mushaf prints it in the red of the
           obligatory madd. Name and length set by the programme's teacher on
           review: "Madd Muttasil", 4 counts — kept simple on purpose. */
        id: "s1-muttasil",
        kind: "madd",
        name: "Madd Muttasil",
        arabic: "مد متصل",
        gloss: "The madd letter and the hamzah are in one word — stretch it four counts.",
        from: 0,
        to: 0,
        counts: "4 counts",
      },
      {
        id: "s1-wasl",
        kind: "hamzah",
        name: "Hamzat al-Wasl",
        arabic: "همزة الوصل",
        gloss: "Joined to what comes before, this opening hamzah is not pronounced at all.",
        from: 1,
        to: 1,
        condition: "on continuing",
      },
      {
        id: "s1-qalqalah",
        kind: "qalqalah",
        name: "Qalqalah",
        arabic: "قلقلة",
        gloss: "The qaf carries sukun, so it bounces off the makhraj.",
        from: 4,
        to: 4,
      },
      {
        id: "s1-leen",
        kind: "madd",
        name: "Madd Leen",
        arabic: "مد لين",
        gloss: "Only if you stop here. Carry on and there is no stretch at all.",
        from: 5,
        to: 5,
        counts: "2, 4 or 6 counts",
        condition: "on stopping",
      },
      {
        id: "s1-ikhfa",
        kind: "ikhfa",
        name: "Ikhfa'",
        arabic: "إخفاء",
        gloss: "Nun sakinah before ta — hidden, held on the ghunnah for two counts.",
        from: 6,
        to: 6,
        counts: "2 counts",
      },
      {
        id: "s1-idgham",
        kind: "idgham",
        name: "Idgham bi Ghunnah",
        arabic: "إدغام بغنة",
        gloss: "The tanwin merges into the waw that follows, carrying the ghunnah with it.",
        from: 7,
        to: 7,
        condition: "on continuing",
      },
    ],
  },

  {
    id: "s2",
    words: [
      "وَمَن",
      "قَتَلَهُۥ",
      "مِنكُم",
      "مُّتَعَمِّدًا",
      "فَجَزَآءٌ",
      "مِّثْلُ",
      "مَا",
      "قَتَلَ",
      "مِنَ",
      "ٱلنَّعَمِ",
    ],
    english:
      "Whoever kills it deliberately owes a compensation equal to what he killed, in livestock.",
    rules: [
      {
        id: "s2-ikhfa-1",
        kind: "ikhfa",
        name: "Ikhfa'",
        arabic: "إخفاء",
        gloss: "Nun sakinah before qaf, hidden across the word boundary.",
        from: 0,
        to: 1,
        counts: "2 counts",
      },
      {
        id: "s2-ikhfa-2",
        kind: "ikhfa",
        name: "Ikhfa'",
        arabic: "إخفاء",
        gloss: "The same rule again, this time inside a single word.",
        from: 2,
        to: 2,
        counts: "2 counts",
      },
      {
        id: "s2-idgham-mim",
        kind: "idgham",
        name: "Idgham Shafawi",
        arabic: "إدغام شفوي",
        gloss: "Meem sakinah meets a meem with shaddah. Two lips, one held sound.",
        from: 2,
        to: 3,
        counts: "2 counts",
      },
      {
        id: "s2-ghunnah",
        kind: "ghunnah",
        name: "Ghunnah",
        arabic: "غنة",
        gloss: "A second ghunnah inside the word — the meem with shaddah.",
        from: 3,
        to: 3,
        counts: "2 counts",
      },
      {
        id: "s2-muttasil",
        kind: "madd",
        name: "Madd Muttasil",
        arabic: "مد متصل",
        gloss: "Madd and hamzah in one word. This one is obligatory, and long.",
        from: 4,
        to: 4,
        counts: "4 or 5 counts",
      },
      {
        id: "s2-idgham-2",
        kind: "idgham",
        name: "Idgham bi Ghunnah",
        arabic: "إدغام بغنة",
        gloss: "The tanwin disappears into the meem and the ghunnah carries across.",
        from: 4,
        to: 5,
        counts: "2 counts",
      },
    ],
  },

  {
    id: "s3",
    words: [
      "يَحْكُمُ",
      "بِهِۦ",
      "ذَوَا",
      "عَدْلٍ",
      "مِّنكُمْ",
      "هَدْيًۢا",
      "بَـٰلِغَ",
      "ٱلْكَعْبَةِ",
    ],
    english: "Two just men among you judge it, as an offering brought to the Ka'bah.",
    rules: [
      {
        id: "s3-qalqalah",
        kind: "qalqalah",
        name: "Qalqalah",
        arabic: "قلقلة",
        gloss: "Dal with sukun in the middle of the word — a light bounce.",
        from: 3,
        to: 3,
      },
      {
        id: "s3-idgham",
        kind: "idgham",
        name: "Idgham bi Ghunnah",
        arabic: "إدغام بغنة",
        gloss: "Tanwin into meem, held two counts on the nose.",
        from: 3,
        to: 4,
        counts: "2 counts",
      },
      {
        id: "s3-ikhfa",
        kind: "ikhfa",
        name: "Ikhfa'",
        arabic: "إخفاء",
        gloss: "Nun sakinah before kaf, hidden again.",
        from: 4,
        to: 4,
        counts: "2 counts",
      },
      {
        id: "s3-izhar-shafawi",
        kind: "izhar",
        name: "Idhar Shafawi",
        arabic: "إظهار شفوي",
        gloss: "Meem sakinah before ha. Show it clearly — no ghunnah, no merging.",
        from: 4,
        to: 5,
      },
      {
        id: "s3-qalqalah-2",
        kind: "qalqalah",
        name: "Qalqalah",
        arabic: "قلقلة",
        gloss: "Another dal with sukun.",
        from: 5,
        to: 5,
      },
      {
        id: "s3-iqlab",
        kind: "iqlab",
        name: "Iqlab",
        arabic: "إقلاب",
        gloss: "Tanwin before ba turns into a meem. The small meem above the word is telling you so.",
        from: 5,
        to: 6,
        counts: "2 counts",
      },
    ],
  },

  {
    id: "s4",
    words: [
      "أَوْ",
      "كَفَّـٰرَةٌ",
      "طَعَامُ",
      "مَسَـٰكِينَ",
      "أَوْ",
      "عَدْلُ",
      "ذَٰلِكَ",
      "صِيَامًا",
      "لِّيَذُوقَ",
      "وَبَالَ",
      "أَمْرِهِۦ",
    ],
    english:
      "Or an expiation of feeding the poor, or the equivalent in fasting, so he tastes the weight of what he did.",
    rules: [
      {
        id: "s4-raa-heavy",
        kind: "raa",
        name: "Raa Mufakhkhamah",
        arabic: "راء مفخمة",
        gloss: "Raa with fathah is heavy — the mouth fills out around it.",
        from: 1,
        to: 1,
      },
      {
        id: "s4-ikhfa-heavy",
        kind: "ikhfa",
        name: "Ikhfa' with a heavy ghunnah",
        arabic: "إخفاء مفخم",
        gloss: "Ta is a heavy letter, so the hidden ghunnah thickens to match it.",
        from: 1,
        to: 2,
        counts: "2 counts",
      },
      {
        id: "s4-qalqalah",
        kind: "qalqalah",
        name: "Qalqalah",
        arabic: "قلقلة",
        gloss: "Dal with sukun, bounced.",
        from: 5,
        to: 5,
      },
      {
        id: "s4-idgham-lam",
        kind: "idgham",
        name: "Idgham bila Ghunnah",
        arabic: "إدغام بغير غنة",
        gloss: "Tanwin into lam, complete — and this time with no ghunnah at all.",
        from: 7,
        to: 8,
      },
      {
        id: "s4-raa-light",
        kind: "raa",
        name: "Raa Muraqqaqah",
        arabic: "راء مرققة",
        gloss: "Raa with kasrah is thin. Same letter, opposite weight.",
        from: 10,
        to: 10,
      },
    ],
  },

  {
    id: "s5",
    words: ["عَفَا", "ٱللَّهُ", "عَمَّا", "سَلَفَ"],
    english: "Allah has pardoned what is past.",
    rules: [
      {
        id: "s5-sakinayn",
        kind: "hamzah",
        name: "Iltiqa' as-Sakinayn",
        arabic: "التقاء الساكنين",
        gloss: "Two silent letters collide, so the alif is dropped rather than stretched.",
        from: 0,
        to: 1,
      },
      {
        id: "s5-lam-heavy",
        kind: "lam",
        name: "Lam of Allah, heavy",
        arabic: "لام لفظ الجلالة",
        gloss: "After a fathah the lam is full. After a kasrah it would be thin.",
        from: 1,
        to: 1,
      },
      {
        id: "s5-ghunnah",
        kind: "ghunnah",
        name: "Ghunnah",
        arabic: "غنة",
        gloss: "Meem with shaddah — hold it two counts before moving on.",
        from: 2,
        to: 2,
        counts: "2 counts",
      },
      {
        id: "s5-tabiee",
        kind: "madd",
        name: "Madd Tabi'i",
        arabic: "مد طبيعي",
        gloss: "The natural stretch. Easy to swallow, and wrong to skip.",
        from: 2,
        to: 2,
        counts: "2 counts",
      },
    ],
  },

  {
    id: "s6",
    words: ["وَمَنْ", "عَادَ", "فَيَنتَقِمُ", "ٱللَّهُ", "مِنْهُ"],
    english: "Whoever returns to it, Allah will exact retribution from him.",
    rules: [
      {
        id: "s6-izhar",
        kind: "izhar",
        name: "Idhar Halqi",
        arabic: "إظهار حلقي",
        gloss: "Nun sakinah before 'ayn, a throat letter. Say it plainly, no ghunnah.",
        from: 0,
        to: 1,
      },
      {
        id: "s6-ikhfa",
        kind: "ikhfa",
        name: "Ikhfa'",
        arabic: "إخفاء",
        gloss: "Nun sakinah before ta, hidden once more.",
        from: 2,
        to: 2,
        counts: "2 counts",
      },
      {
        id: "s6-lam-heavy",
        kind: "lam",
        name: "Lam of Allah, heavy",
        arabic: "لام لفظ الجلالة",
        gloss: "Preceded by a dammah, so it stays full.",
        from: 3,
        to: 3,
      },
      {
        id: "s6-izhar-2",
        kind: "izhar",
        name: "Idhar Halqi",
        arabic: "إظهار حلقي",
        gloss: "Nun sakinah before ha. Another throat letter, shown clearly.",
        from: 4,
        to: 4,
      },
    ],
  },

  {
    id: "s7",
    words: ["وَٱللَّهُ", "عَزِيزٌ", "ذُو", "ٱنتِقَامٍ"],
    english: "And Allah is mighty, and capable of retribution.",
    rules: [
      {
        id: "s7-lam-heavy",
        kind: "lam",
        name: "Lam of Allah, heavy",
        arabic: "لام لفظ الجلالة",
        gloss: "Full again, on the fathah before it.",
        from: 0,
        to: 0,
      },
      {
        id: "s7-ikhfa-light",
        kind: "ikhfa",
        name: "Ikhfa' with a thin ghunnah",
        arabic: "إخفاء مرقق",
        gloss: "Dhal is a light letter, so this ghunnah stays thin — the opposite of the one earlier.",
        from: 1,
        to: 2,
        counts: "2 counts",
      },
      {
        id: "s7-dropped",
        kind: "madd",
        name: "Madd dropped",
        arabic: "حذف المد",
        gloss: "A madd letter that is not stretched: the two silent letters cancel it.",
        from: 2,
        to: 3,
      },
      {
        id: "s7-ikhfa",
        kind: "ikhfa",
        name: "Ikhfa'",
        arabic: "إخفاء",
        gloss: "Nun sakinah before ta, the last hidden nun in the ayah.",
        from: 3,
        to: 3,
        counts: "2 counts",
      },
      {
        id: "s7-arid",
        kind: "madd",
        name: "Madd 'Arid lis-Sukun",
        arabic: "مد عارض للسكون",
        gloss: "Stopping at the end makes the last letter silent, and the madd before it stretches.",
        from: 3,
        to: 3,
        counts: "2, 4 or 6 counts",
        condition: "on stopping",
      },
    ],
  },
] as const;

/** Every rule in the ayah, flattened — used by the counter on the landing page. */
export const ALL_RULES = MAIDAH_95.flatMap((s) => s.rules);

/** The verse as one string, for meta tags and the full-verse band. */
export const FULL_VERSE = MAIDAH_95.map((s) => s.words.join(" ")).join(" ");
