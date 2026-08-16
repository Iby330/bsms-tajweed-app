-- Extend the memorisation run down to Al-Mulk (67).
--
-- The table stopped at Al-Jinn (72), which is 43 surahs back from An-Nas. That
-- held while nobody had gone deeper, but last year three students finished 45
-- and 48, and hifz_records.surah_number is a foreign key here — their passes
-- had nowhere to point.
--
-- 67–114 is the range the app already believes in: SURAH_META in
-- web/src/lib/hifz/surah-meta.ts has covered exactly these since it was
-- written, so the table was the odd one out, not the code.
--
-- order_index is the memorisation position, counting back from An-Nas:
-- 115 - number. An-Nas is 1, Al-Jinn is 43, Al-Mulk is 48.

insert into surahs (number, order_index, name_ar, name_en) values
  (71, 44, 'نوح',    'Nuh'),
  (70, 45, 'المعارج', 'Al-Ma''arij'),
  (69, 46, 'الحاقة',  'Al-Haqqah'),
  (68, 47, 'القلم',   'Al-Qalam'),
  (67, 48, 'الملك',   'Al-Mulk')
on conflict (number) do nothing;
