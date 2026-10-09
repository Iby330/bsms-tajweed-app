-- Salsabeel takes Umm al-Kitāb in Term 1, as Masjid Al-Aqsa does.
--
-- 0068 gave Sajeda's Salsabeel the basics plan as the code had it: Qāʿidah
-- now, Umm al-Kitāb from Term 2. But the basics plan is Al-Aqsa's, and 0061
-- moved Al-Aqsa's Umm al-Kitāb into Term 1 (programme lead, 2026-10-09:
-- "same curriculum as Masjid Al-Aqsa, so Qāʿidah and Umm al-Kitāb").
--
-- Episode k on week k, one a week. Al-Aqsa's doubled-up week 5
-- (class_course_items) was Moadh's own pacing and is not copied.
-- The Qāʿidah homework hold from 0066/0068 is untouched.

update class_courses cc
   set term_id = 1, position = 2
  from classes c, courses co
 where cc.class_id = c.id and cc.course_id = co.id
   and c.name = 'Salsabeel' and co.key = 'ummul_kitab'
returning cc.term_id, cc.position;
