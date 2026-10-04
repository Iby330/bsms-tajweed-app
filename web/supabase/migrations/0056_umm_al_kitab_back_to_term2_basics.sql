-- Undo 0055: the basics classes take Umm al-Kitāb in Term 2 after all.
--
-- 0055 moved it into Term 1 for Masjid Al-Aqsa and Hareer on a mix-up between
-- classes (it is Al-Haram that has it from the start). The programme lead
-- corrected it the same day: Al-Aqsa (Moadh) and Hareer (Sajeda) are the
-- Arabic basics classes and study it from Term 2, as 0026 had it.

update class_courses cc
set term_id = 2, position = 1
from classes c, courses co
where cc.class_id = c.id and cc.course_id = co.id
  and c.name in ('Masjid Al-Aqsa', 'Hareer') and co.key = 'ummul_kitab';
