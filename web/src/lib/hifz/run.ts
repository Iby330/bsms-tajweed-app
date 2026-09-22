/* GENERATED from supabase/migrations/0002_reference_seed.sql (names) and
 * surah-meta.ts (ayah counts). Do not edit by hand; regenerate instead.
 *
 * The two juz of the memorisation run, in the order they are memorised:
 * An-Nas (114) first, down to Al-Mulk (67).
 *
 * ⚠️ 67–71 are NOT in the database seed. The seed stops at Al-Jinn (72), and
 * hizb.ts treats Hizb 57 as outside the programme. Their names here are
 * added in the seed's own transliteration style so the landing page can show
 * the full two juz — but until the seed and hizb.ts are extended, the app
 * cannot track a student through Al-Mulk to Nuh. This file is the promise;
 * those two are the delivery.
 */

export type RunSurah = { number: number; en: string; ar: string; ayahs: number };

export const RUN: readonly RunSurah[] = [
  { number: 114, en: "An-Nas", ar: "الناس", ayahs: 6 },
  { number: 113, en: "Al-Falaq", ar: "الفلق", ayahs: 5 },
  { number: 112, en: "Al-Ikhlas", ar: "الإخلاص", ayahs: 4 },
  { number: 111, en: "Al-Masad", ar: "المسد", ayahs: 5 },
  { number: 110, en: "An-Nasr", ar: "النصر", ayahs: 3 },
  { number: 109, en: "Al-Kafirun", ar: "الكافرون", ayahs: 6 },
  { number: 108, en: "Al-Kawthar", ar: "الكوثر", ayahs: 3 },
  { number: 107, en: "Al-Ma'un", ar: "الماعون", ayahs: 7 },
  { number: 106, en: "Quraysh", ar: "قريش", ayahs: 4 },
  { number: 105, en: "Al-Fil", ar: "الفيل", ayahs: 5 },
  { number: 104, en: "Al-Humazah", ar: "الهمزة", ayahs: 9 },
  { number: 103, en: "Al-Asr", ar: "العصر", ayahs: 3 },
  { number: 102, en: "At-Takathur", ar: "التكاثر", ayahs: 8 },
  { number: 101, en: "Al-Qari'ah", ar: "القارعة", ayahs: 11 },
  { number: 100, en: "Al-Adiyat", ar: "العاديات", ayahs: 11 },
  { number: 99, en: "Az-Zalzalah", ar: "الزلزلة", ayahs: 8 },
  { number: 98, en: "Al-Bayyinah", ar: "البينة", ayahs: 8 },
  { number: 97, en: "Al-Qadr", ar: "القدر", ayahs: 5 },
  { number: 96, en: "Al-Alaq", ar: "العلق", ayahs: 19 },
  { number: 95, en: "At-Tin", ar: "التين", ayahs: 8 },
  { number: 94, en: "Ash-Sharh", ar: "الشرح", ayahs: 8 },
  { number: 93, en: "Ad-Duha", ar: "الضحى", ayahs: 11 },
  { number: 92, en: "Al-Layl", ar: "الليل", ayahs: 21 },
  { number: 91, en: "Ash-Shams", ar: "الشمس", ayahs: 15 },
  { number: 90, en: "Al-Balad", ar: "البلد", ayahs: 20 },
  { number: 89, en: "Al-Fajr", ar: "الفجر", ayahs: 30 },
  { number: 88, en: "Al-Ghashiyah", ar: "الغاشية", ayahs: 26 },
  { number: 87, en: "Al-A'la", ar: "الأعلى", ayahs: 19 },
  { number: 86, en: "At-Tariq", ar: "الطارق", ayahs: 17 },
  { number: 85, en: "Al-Buruj", ar: "البروج", ayahs: 22 },
  { number: 84, en: "Al-Inshiqaq", ar: "الانشقاق", ayahs: 25 },
  { number: 83, en: "Al-Mutaffifin", ar: "المطففين", ayahs: 36 },
  { number: 82, en: "Al-Infitar", ar: "الانفطار", ayahs: 19 },
  { number: 81, en: "At-Takwir", ar: "التكوير", ayahs: 29 },
  { number: 80, en: "Abasa", ar: "عبس", ayahs: 42 },
  { number: 79, en: "An-Nazi'at", ar: "النازعات", ayahs: 46 },
  { number: 78, en: "An-Naba", ar: "النبأ", ayahs: 40 },
  { number: 77, en: "Al-Mursalat", ar: "المرسلات", ayahs: 50 },
  { number: 76, en: "Al-Insan", ar: "الإنسان", ayahs: 31 },
  { number: 75, en: "Al-Qiyamah", ar: "القيامة", ayahs: 40 },
  { number: 74, en: "Al-Muddaththir", ar: "المدثر", ayahs: 56 },
  { number: 73, en: "Al-Muzzammil", ar: "المزمل", ayahs: 20 },
  { number: 72, en: "Al-Jinn", ar: "الجن", ayahs: 28 },
  { number: 71, en: "Nuh", ar: "نوح", ayahs: 28 },
  { number: 70, en: "Al-Ma'arij", ar: "المعارج", ayahs: 44 },
  { number: 69, en: "Al-Haqqah", ar: "الحاقة", ayahs: 52 },
  { number: 68, en: "Al-Qalam", ar: "القلم", ayahs: 52 },
  { number: 67, en: "Al-Mulk", ar: "الملك", ayahs: 30 },
];
