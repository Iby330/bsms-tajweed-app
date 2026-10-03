-- The sisters' classes take the brothers' plans (programme lead, 2026-10-03).
--
--   Zukhruf   (Ola)      the new curriculum, as Masjid An-Nabawi — its Term 1
--                        timetable included (class_course_items, 0045)
--   Salsabeel (Rezarta)  the normal curriculum, as Masjid Quba
--   Rayyan    (Wala)     the normal curriculum without Mabādi' (the matn)
--   Hareer    (Sajeda)   a basics class, as Masjid Al-Aqsa
--
-- Copied from the brothers' class rows, so each sisters' class says exactly
-- what its brothers' counterpart says today. With a syllabus, a sister's
-- content opens by the class's plan, at the sisters' Wednesday times (0052).
-- The app's copy is SYLLABUS / CLASS_GROUP in lib/curriculum/syllabus.ts.

with map(sister, brother) as (values
  ('Zukhruf', 'Masjid An-Nabawi'),
  ('Salsabeel', 'Masjid Quba'),
  ('Rayyan', 'Masjid Quba'),
  ('Hareer', 'Masjid Al-Aqsa')
)
insert into class_courses (class_id, course_id, term_id, position)
select s.id, cc.course_id, cc.term_id, cc.position
from map
join classes s on s.name = map.sister
join classes b on b.name = map.brother
join class_courses cc on cc.class_id = b.id
on conflict (class_id, course_id) do update
  set term_id = excluded.term_id, position = excluded.position;

-- Rayyan takes no Mabādi'
delete from class_courses cc
using classes c, courses co
where cc.class_id = c.id and cc.course_id = co.id
  and c.name = 'Rayyan' and co.key = 'mabadi';

insert into class_course_items (class_id, course_id, ordinal, week_number)
select s.id, i.course_id, i.ordinal, i.week_number
from classes s, classes b, class_course_items i
where s.name = 'Zukhruf' and b.name = 'Masjid An-Nabawi' and i.class_id = b.id
on conflict (class_id, course_id, ordinal) do update set week_number = excluded.week_number;
