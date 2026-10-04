-- The basics classes take Umm al-Kitāb in Term 1, alongside Qāʿidah.
--
-- 0026 filed it under Term 2 for Masjid Al-Aqsa (group 5), and 0053 copied
-- that to Hareer; the programme lead confirmed on 2026-10-04 that it is a
-- Term 1 course for them. Terms 2 and 3 are still to be decided. The app's
-- copy is SYLLABUS[5] in lib/curriculum/syllabus.ts.

update class_courses cc
set term_id = 1, position = 2
from classes c, courses co
where cc.class_id = c.id and cc.course_id = co.id
  and c.name in ('Masjid Al-Aqsa', 'Hareer') and co.key = 'ummul_kitab';
