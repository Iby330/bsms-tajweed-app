/**
 * The 114 surahs: number, name, and how many ayahs each has.
 *
 * Used by the applications screen to record which passage an applicant was
 * asked to read at the recitation session, which needs the ayah count to
 * offer a range that cannot run off the end of the surah.
 *
 * Generated from the Quran.com API (api.quran.com/api/v4/chapters) on
 * 2026-09-22 and committed rather than fetched, so the screen needs no
 * network and cannot be left waiting on somebody else's service. The ayah
 * counts total 6,236, the standard Hafs count, which is the check that the
 * table came down whole; a test asserts it. The `surahs` table in the
 * database holds only 67 to 114 (the memorisation run) and no ayah counts,
 * so it cannot answer this.
 */

export type Surah = { number: number; name: string; nameAr: string; ayahs: number };

const RAW: [number, string, string, number][] = [
  [1, "Al-Fatihah", "الفاتحة", 7],
  [2, "Al-Baqarah", "البقرة", 286],
  [3, "Ali 'Imran", "آل عمران", 200],
  [4, "An-Nisa", "النساء", 176],
  [5, "Al-Ma'idah", "المائدة", 120],
  [6, "Al-An'am", "الأنعام", 165],
  [7, "Al-A'raf", "الأعراف", 206],
  [8, "Al-Anfal", "الأنفال", 75],
  [9, "At-Tawbah", "التوبة", 129],
  [10, "Yunus", "يونس", 109],
  [11, "Hud", "هود", 123],
  [12, "Yusuf", "يوسف", 111],
  [13, "Ar-Ra'd", "الرعد", 43],
  [14, "Ibrahim", "ابراهيم", 52],
  [15, "Al-Hijr", "الحجر", 99],
  [16, "An-Nahl", "النحل", 128],
  [17, "Al-Isra", "الإسراء", 111],
  [18, "Al-Kahf", "الكهف", 110],
  [19, "Maryam", "مريم", 98],
  [20, "Taha", "طه", 135],
  [21, "Al-Anbya", "الأنبياء", 112],
  [22, "Al-Hajj", "الحج", 78],
  [23, "Al-Mu'minun", "المؤمنون", 118],
  [24, "An-Nur", "النور", 64],
  [25, "Al-Furqan", "الفرقان", 77],
  [26, "Ash-Shu'ara", "الشعراء", 227],
  [27, "An-Naml", "النمل", 93],
  [28, "Al-Qasas", "القصص", 88],
  [29, "Al-'Ankabut", "العنكبوت", 69],
  [30, "Ar-Rum", "الروم", 60],
  [31, "Luqman", "لقمان", 34],
  [32, "As-Sajdah", "السجدة", 30],
  [33, "Al-Ahzab", "الأحزاب", 73],
  [34, "Saba", "سبإ", 54],
  [35, "Fatir", "فاطر", 45],
  [36, "Ya-Sin", "يس", 83],
  [37, "As-Saffat", "الصافات", 182],
  [38, "Sad", "ص", 88],
  [39, "Az-Zumar", "الزمر", 75],
  [40, "Ghafir", "غافر", 85],
  [41, "Fussilat", "فصلت", 54],
  [42, "Ash-Shuraa", "الشورى", 53],
  [43, "Az-Zukhruf", "الزخرف", 89],
  [44, "Ad-Dukhan", "الدخان", 59],
  [45, "Al-Jathiyah", "الجاثية", 37],
  [46, "Al-Ahqaf", "الأحقاف", 35],
  [47, "Muhammad", "محمد", 38],
  [48, "Al-Fath", "الفتح", 29],
  [49, "Al-Hujurat", "الحجرات", 18],
  [50, "Qaf", "ق", 45],
  [51, "Adh-Dhariyat", "الذاريات", 60],
  [52, "At-Tur", "الطور", 49],
  [53, "An-Najm", "النجم", 62],
  [54, "Al-Qamar", "القمر", 55],
  [55, "Ar-Rahman", "الرحمن", 78],
  [56, "Al-Waqi'ah", "الواقعة", 96],
  [57, "Al-Hadid", "الحديد", 29],
  [58, "Al-Mujadila", "المجادلة", 22],
  [59, "Al-Hashr", "الحشر", 24],
  [60, "Al-Mumtahanah", "الممتحنة", 13],
  [61, "As-Saf", "الصف", 14],
  [62, "Al-Jumu'ah", "الجمعة", 11],
  [63, "Al-Munafiqun", "المنافقون", 11],
  [64, "At-Taghabun", "التغابن", 18],
  [65, "At-Talaq", "الطلاق", 12],
  [66, "At-Tahrim", "التحريم", 12],
  [67, "Al-Mulk", "الملك", 30],
  [68, "Al-Qalam", "القلم", 52],
  [69, "Al-Haqqah", "الحاقة", 52],
  [70, "Al-Ma'arij", "المعارج", 44],
  [71, "Nuh", "نوح", 28],
  [72, "Al-Jinn", "الجن", 28],
  [73, "Al-Muzzammil", "المزمل", 20],
  [74, "Al-Muddaththir", "المدثر", 56],
  [75, "Al-Qiyamah", "القيامة", 40],
  [76, "Al-Insan", "الانسان", 31],
  [77, "Al-Mursalat", "المرسلات", 50],
  [78, "An-Naba", "النبإ", 40],
  [79, "An-Nazi'at", "النازعات", 46],
  [80, "'Abasa", "عبس", 42],
  [81, "At-Takwir", "التكوير", 29],
  [82, "Al-Infitar", "الإنفطار", 19],
  [83, "Al-Mutaffifin", "المطففين", 36],
  [84, "Al-Inshiqaq", "الإنشقاق", 25],
  [85, "Al-Buruj", "البروج", 22],
  [86, "At-Tariq", "الطارق", 17],
  [87, "Al-A'la", "الأعلى", 19],
  [88, "Al-Ghashiyah", "الغاشية", 26],
  [89, "Al-Fajr", "الفجر", 30],
  [90, "Al-Balad", "البلد", 20],
  [91, "Ash-Shams", "الشمس", 15],
  [92, "Al-Layl", "الليل", 21],
  [93, "Ad-Duhaa", "الضحى", 11],
  [94, "Ash-Sharh", "الشرح", 8],
  [95, "At-Tin", "التين", 8],
  [96, "Al-'Alaq", "العلق", 19],
  [97, "Al-Qadr", "القدر", 5],
  [98, "Al-Bayyinah", "البينة", 8],
  [99, "Az-Zalzalah", "الزلزلة", 8],
  [100, "Al-'Adiyat", "العاديات", 11],
  [101, "Al-Qari'ah", "القارعة", 11],
  [102, "At-Takathur", "التكاثر", 8],
  [103, "Al-'Asr", "العصر", 3],
  [104, "Al-Humazah", "الهمزة", 9],
  [105, "Al-Fil", "الفيل", 5],
  [106, "Quraysh", "قريش", 4],
  [107, "Al-Ma'un", "الماعون", 7],
  [108, "Al-Kawthar", "الكوثر", 3],
  [109, "Al-Kafirun", "الكافرون", 6],
  [110, "An-Nasr", "النصر", 3],
  [111, "Al-Masad", "المسد", 5],
  [112, "Al-Ikhlas", "الإخلاص", 4],
  [113, "Al-Falaq", "الفلق", 5],
  [114, "An-Nas", "الناس", 6],
];

export const SURAHS: Surah[] = RAW.map(([number, name, nameAr, ayahs]) => ({
  number, name, nameAr, ayahs,
}));

export const surahByNumber = (n: number): Surah | undefined =>
  SURAHS.find((s) => s.number === n);

/**
 * How a recorded passage reads on screen: "Al-Baqarah 255 to 257", or
 * "Al-Baqarah 255" when it is a single ayah.
 */
export function passageLabel(
  surah: number | null, from: number | null, to: number | null,
): string | null {
  if (!surah || !from) return null;
  const s = surahByNumber(surah);
  if (!s) return null;
  return to && to !== from ? `${s.name} ${from} to ${to}` : `${s.name} ${from}`;
}
