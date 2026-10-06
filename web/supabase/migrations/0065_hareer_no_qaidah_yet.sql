-- Hareer waits: no Qāʿidah for them yet.
--
-- Hareer (Sajeda) follows Al-Aqsa's basics plan (0053), so when the sisters'
-- week 1 opened (0057_open_sisters_week1) they were handed Al-Aqsa's
-- Qāʿidah homework 1 (HW 301, 0063). The programme lead asked to leave
-- Hareer for now, so Qāʿidah comes off their plan: nothing opens for them in
-- Term 1 until it is added back, e.g.
--   insert into class_courses (class_id, course_id, term_id, position)
--   select c.id, co.id, 1, 1 from classes c, courses co
--   where c.name = 'Hareer' and co.key = 'qaidah';
-- Umm al-Kitāb in Term 2 is untouched. The calendar's copy (SYLLABUS /
-- CLASS_GROUP in syllabus.ts) still names Qāʿidah for Hareer's Term 1.

delete from class_courses cc
using classes c, courses co
where cc.class_id = c.id and cc.course_id = co.id
  and c.name = 'Hareer' and co.key = 'qaidah';
