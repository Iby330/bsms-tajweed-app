-- Extend the memorisation run to the last five ajza: down to Al-Ahqaf (46),
-- the start of juz 26 (programme lead, 2026-10-20). It stopped at Al-Mulk (67,
-- 0018), so no target, start surah or pass could go past the end of juz 29:
-- hifz_profiles.start_surah and hifz_records.surah_number are foreign keys
-- here, and the target picker offers exactly the rows of this table.
--
-- The mushaf pages for these surahs (502–561) and their page fonts were
-- already seeded; only the run itself stopped short.
--
-- order_index is the memorisation position, counting back from An-Nas:
-- 115 - number. Al-Mulk is 48, At-Tahrim 49, Al-Ahqaf 69.

insert into surahs (number, order_index, name_ar, name_en) values
  (66, 49, 'التحريم',   'At-Tahrim'),
  (65, 50, 'الطلاق',    'At-Talaq'),
  (64, 51, 'التغابن',   'At-Taghabun'),
  (63, 52, 'المنافقون', 'Al-Munafiqun'),
  (62, 53, 'الجمعة',    'Al-Jumu''ah'),
  (61, 54, 'الصف',      'As-Saf'),
  (60, 55, 'الممتحنة',  'Al-Mumtahanah'),
  (59, 56, 'الحشر',     'Al-Hashr'),
  (58, 57, 'المجادلة',  'Al-Mujadila'),
  (57, 58, 'الحديد',    'Al-Hadid'),
  (56, 59, 'الواقعة',   'Al-Waqi''ah'),
  (55, 60, 'الرحمن',    'Ar-Rahman'),
  (54, 61, 'القمر',     'Al-Qamar'),
  (53, 62, 'النجم',     'An-Najm'),
  (52, 63, 'الطور',     'At-Tur'),
  (51, 64, 'الذاريات',  'Adh-Dhariyat'),
  (50, 65, 'ق',         'Qaf'),
  (49, 66, 'الحجرات',   'Al-Hujurat'),
  (48, 67, 'الفتح',     'Al-Fath'),
  (47, 68, 'محمد',      'Muhammad'),
  (46, 69, 'الأحقاف',   'Al-Ahqaf')
on conflict (number) do nothing
returning number, order_index, name_en;
