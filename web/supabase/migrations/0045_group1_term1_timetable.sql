-- Group 1's (Masjid An-Nabawi) Term 1 timetable, from the programme lead.
--
-- Ghunna, Ṣifāt and Mudūd together, 2–4 episodes a week across weeks 1–8.
-- The Ṣifāt here is the existing course (HW 9–15, key sifaat_old), not the
-- new one: 0044 moved sifaat_new into Term 1 on a misreading, so it goes back
-- to Term 2 and sifaat_old joins Term 1.
--
--   week 1 · 5 Oct   Ghunna 1–2, Ṣifāt 1
--   week 2 · 12 Oct  Ghunna 3–6
--   week 3 · 19 Oct  Ghunna 7–8
--   week 4 · 26 Oct  Ṣifāt 2–4
--   week 5 · 2 Nov   Mudūd 1–3
--   week 6 · 9 Nov   Ṣifāt 6–7
--   week 7 · 16 Nov  Mudūd 4–5
--   week 8 · 23 Nov  Ṣifāt 5, Mudūd 6
--
-- (week n = the week whose class is that Monday; it opens the Thursday
-- before, per 0042.)

update class_courses cc
set term_id = 2, position = 1
from classes c, courses co
where cc.class_id = c.id and cc.course_id = co.id
  and c.name = 'Masjid An-Nabawi' and co.key = 'sifaat_new';

insert into class_courses (class_id, course_id, term_id, position)
select c.id, co.id, 1, 3
from classes c, courses co
where c.name = 'Masjid An-Nabawi' and co.key = 'sifaat_old'
on conflict (class_id, course_id) do update set term_id = 1, position = 3;

delete from class_course_items
where class_id = (select id from classes where name = 'Masjid An-Nabawi');

insert into class_course_items (class_id, course_id, ordinal, week_number)
select c.id, co.id, t.ordinal, t.week_number
from (values
  ('ghunna', 1, 1), ('ghunna', 2, 1), ('ghunna', 3, 2), ('ghunna', 4, 2),
  ('ghunna', 5, 2), ('ghunna', 6, 2), ('ghunna', 7, 3), ('ghunna', 8, 3),
  ('sifaat_old', 1, 1), ('sifaat_old', 2, 4), ('sifaat_old', 3, 4),
  ('sifaat_old', 4, 4), ('sifaat_old', 5, 8), ('sifaat_old', 6, 6),
  ('sifaat_old', 7, 6),
  ('mudood', 1, 5), ('mudood', 2, 5), ('mudood', 3, 5),
  ('mudood', 4, 7), ('mudood', 5, 7), ('mudood', 6, 8)
) as t(course_key, ordinal, week_number)
join courses co on co.key = t.course_key
cross join classes c
where c.name = 'Masjid An-Nabawi';
