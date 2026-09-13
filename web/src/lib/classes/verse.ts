/**
 * The text each class is named after.
 *
 * Four of the seven classes take their names from the Qur'an and the sunnah,
 * and each name is a word in a specific passage. The mosque classes are named
 * after places rather than out of a text, so they have no entry here and their
 * masthead simply carries no verse.
 *
 * `word` is the class's own word as it appears in the line, so the component
 * can pick it out. It has to be the exact substring — diacritics and all —
 * because the component matches on it rather than on a regex; a mismatch
 * silently renders the line unhighlighted rather than mangling the Arabic.
 *
 * Al-Insān is the one passage the app already holds: `quran_words` carries
 * surahs 67–114, so that Arabic is the same Uthmani text the mushaf reader
 * draws. Fāṭir and Az-Zukhruf fall outside that range and were taken from
 * quran.com. All three translations are Dr. Mustafa Khattab, The Clear Qur'an.
 */
export type ClassVerse = {
  /** Arabic, as printed in the Madani mushaf. */
  ar: string;
  /** The class's own word, exactly as it appears in `ar`. */
  arWord: string;
  en: string;
  /** The class's own word, exactly as it appears in `en`. */
  enWord: string;
  /** Where it is from, shown as the attribution. */
  source: string;
};

const VERSES: Record<string, ClassVerse> = {
  rayyan: {
    ar: "إِنَّ فِي الْجَنَّةِ بَابًا يُقَالُ لَهُ الرَّيَّانُ يَدْخُلُ مِنْهُ الصَّائِمُونَ يَوْمَ الْقِيَامَةِ",
    arWord: "الرَّيَّانُ",
    en: "In Paradise there is a gate called Rayyān, through which only those who fast will enter on the Day of Resurrection.",
    enWord: "Rayyān",
    source: "Ṣaḥīḥ Muslim 1152",
  },
  // Fāṭir 35:33. The text carried two spurious small high meems (U+06E2) —
  // the iqlāb mark — one before yā' and one before wāw. Iqlāb only occurs
  // before bā'; both of those positions are idghām with ghunna, so the mark
  // was wrong in each. They came in with the text, which was taken from
  // quran.com rather than the app's own quran_words (that table holds
  // surahs 67–114 only, so Fāṭir is not in it to check against).
  hareer: {
    ar: "جَنَّـٰتُ عَدْنٍ يَدْخُلُونَهَا يُحَلَّوْنَ فِيهَا مِنْ أَسَاوِرَ مِن ذَهَبٍ وَلُؤْلُؤًا ۖ وَلِبَاسُهُمْ فِيهَا حَرِيرٌ",
    arWord: "حَرِيرٌ",
    en: "They will enter the Gardens of Eternity, where they will be adorned with bracelets of gold and pearls, and their clothing will be silk.",
    enWord: "silk",
    source: "Fāṭir 35:33",
  },
  salsabeel: {
    ar: "وَيُسْقَوْنَ فِيهَا كَأْسًا كَانَ مِزَاجُهَا زَنجَبِيلًا ۝ عَيْنًا فِيهَا تُسَمَّىٰ سَلْسَبِيلًا",
    arWord: "سَلْسَبِيلًا",
    en: "And they will be given a drink ˹of pure wine˺ flavoured with ginger from a spring there, called Salsabīl.",
    enWord: "Salsabīl",
    source: "Al-Insān 76:17–18",
  },
  zukhruf: {
    // The surah's own name is not in the ayah; the word carrying it is ذَهَب.
    ar: "يُطَافُ عَلَيْهِم بِصِحَافٍ مِّن ذَهَبٍ وَأَكْوَابٍ ۖ وَفِيهَا مَا تَشْتَهِيهِ ٱلْأَنفُسُ وَتَلَذُّ ٱلْأَعْيُنُ ۖ وَأَنتُمْ فِيهَا خَـٰلِدُونَ",
    arWord: "ذَهَبٍ",
    en: "Golden trays and cups will be passed around to them. There will be whatever the souls desire and the eyes delight in. And you will be there forever.",
    enWord: "Golden",
    source: "Az-Zukhruf 43:71",
  },
};

/** The verse for a class, or null where the class is named after a place. */
export function classVerse(className: string | null | undefined): ClassVerse | null {
  return VERSES[(className ?? "").trim().toLowerCase()] ?? null;
}
