-- ═══════════════════════════════════════════════════════════════════════
-- Reference seed: surahs (114→72), classes, terms + weeks (PLACEHOLDER dates)
-- Dates are placeholders until the faculty calendar drops (brainstorm Q15) —
-- swapping in real dates is an UPDATE on terms/weeks, not a code change.
-- ═══════════════════════════════════════════════════════════════════════

-- 43 surahs, memorisation order: An-Nas (114) first → Al-Jinn (72) last
insert into surahs (number, order_index, name_ar, name_en) values
  (114, 1,  'الناس',      'An-Nas'),
  (113, 2,  'الفلق',      'Al-Falaq'),
  (112, 3,  'الإخلاص',    'Al-Ikhlas'),
  (111, 4,  'المسد',      'Al-Masad'),
  (110, 5,  'النصر',      'An-Nasr'),
  (109, 6,  'الكافرون',   'Al-Kafirun'),
  (108, 7,  'الكوثر',     'Al-Kawthar'),
  (107, 8,  'الماعون',    'Al-Ma''un'),
  (106, 9,  'قريش',       'Quraysh'),
  (105, 10, 'الفيل',      'Al-Fil'),
  (104, 11, 'الهمزة',     'Al-Humazah'),
  (103, 12, 'العصر',      'Al-Asr'),
  (102, 13, 'التكاثر',    'At-Takathur'),
  (101, 14, 'القارعة',    'Al-Qari''ah'),
  (100, 15, 'العاديات',   'Al-Adiyat'),
  (99,  16, 'الزلزلة',    'Az-Zalzalah'),
  (98,  17, 'البينة',     'Al-Bayyinah'),
  (97,  18, 'القدر',      'Al-Qadr'),
  (96,  19, 'العلق',      'Al-Alaq'),
  (95,  20, 'التين',      'At-Tin'),
  (94,  21, 'الشرح',      'Ash-Sharh'),
  (93,  22, 'الضحى',      'Ad-Duha'),
  (92,  23, 'الليل',      'Al-Layl'),
  (91,  24, 'الشمس',      'Ash-Shams'),
  (90,  25, 'البلد',      'Al-Balad'),
  (89,  26, 'الفجر',      'Al-Fajr'),
  (88,  27, 'الغاشية',    'Al-Ghashiyah'),
  (87,  28, 'الأعلى',     'Al-A''la'),
  (86,  29, 'الطارق',     'At-Tariq'),
  (85,  30, 'البروج',     'Al-Buruj'),
  (84,  31, 'الانشقاق',   'Al-Inshiqaq'),
  (83,  32, 'المطففين',   'Al-Mutaffifin'),
  (82,  33, 'الانفطار',   'Al-Infitar'),
  (81,  34, 'التكوير',    'At-Takwir'),
  (80,  35, 'عبس',        'Abasa'),
  (79,  36, 'النازعات',   'An-Nazi''at'),
  (78,  37, 'النبأ',      'An-Naba'),
  (77,  38, 'المرسلات',   'Al-Mursalat'),
  (76,  39, 'الإنسان',    'Al-Insan'),
  (75,  40, 'القيامة',    'Al-Qiyamah'),
  (74,  41, 'المدثر',     'Al-Muddaththir'),
  (73,  42, 'المزمل',     'Al-Muzzammil'),
  (72,  43, 'الجن',       'Al-Jinn');

-- 7 classes (real names; teacher_id wired when teacher profiles exist)
insert into classes (name, section) values
  ('Masjid An-Nabawi', 'brothers'),
  ('Masjid Al-Aqsa',   'brothers'),
  ('Masjid Al-Haram',  'brothers'),
  ('Zukhruf',          'sisters'),
  ('Hareer',           'sisters'),
  ('Rayyan',           'sisters'),
  ('Salsabeel',        'sisters');

-- 3 terms — PLACEHOLDER dates; exam maxima are real (89/93/98, brainstorm A3)
insert into terms (id, starts_on, ends_on, exam_max) values
  (1, '2026-10-05', '2026-12-18', 89),
  (2, '2027-01-11', '2027-03-26', 93),
  (3, '2027-04-12', '2027-06-25', 98);

-- weeks: T1×10, T2×8, T3×8 — unlock Mondays 00:00 UTC from term start
insert into weeks (term_id, number, unlock_at)
select t.id, n, (t.starts_on + (n - 1) * interval '7 days')::timestamptz
from terms t
cross join lateral generate_series(1, case t.id when 1 then 10 else 8 end) as n;

-- Umm al-Kitab lessons — Term 1, 9 episodes (real titles, brainstorm Q3);
-- youtube_id null until the channel re-uploads after summer
insert into lessons (week_id, series, title, position)
select w.id, 'umm_al_kitab',
  (array[
    'Umm al-Kitab 1 — Names, virtues and importance of Surah Al-Fatiha',
    'Umm al-Kitab 2 — Al-Isti''adha',
    'Umm al-Kitab 3 — The Basmala',
    'Umm al-Kitab 4 — Verse 2',
    'Umm al-Kitab 5 — Verse 3',
    'Umm al-Kitab 6 — Verse 4',
    'Umm al-Kitab 7 — Verse 5',
    'Umm al-Kitab 8 — Verse 6',
    'Umm al-Kitab 9 — Verse 7'
  ])[w.number], 2
from weeks w
where w.term_id = 1 and w.number <= 9;
