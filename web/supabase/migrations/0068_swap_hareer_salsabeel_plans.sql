-- Hareer and Salsabeel had each other's plans.
--
-- 0041 gave Sajeda Hareer and Rezarta Salsabeel, and 0053/0066 built the
-- plans on that: Hareer the basics class (Qāʿidah, its homework held),
-- Salsabeel the normal curriculum with Mabādi'. The teachers are the other
-- way round (programme lead, 2026-10-09): Sajeda teaches Salsabeel, Rezarta
-- Hareer, and each class row already holds its real teacher and students.
-- So the people stay where they are and the plans swap:
--
--   Hareer (Rezarta)  — the current content plus the Matn (group 4)
--   Salsabeel (Sajeda) — Qāʿidah Nūrāniyyah, Umm al-Kitāb from Term 2 (group 5),
--                        Qāʿidah homework still held until it is released
--
-- Rezarta's class had nothing open (Term 1 was Qāʿidah, held), which is the
-- "curriculum is locked" they reported. Sajeda's class loses HW 1 and HW 201
-- from view; their submissions stay in the database.
--
-- By name, and delete-then-insert, so a re-run lands on the same rows.

delete from class_courses
where class_id in (select id from classes where name in ('Hareer', 'Salsabeel'));

insert into class_courses (class_id, course_id, term_id, position)
select c.id, co.id, p.term_id, p.position
from (values
  ('Hareer',    'ghunna',      1, 1),
  ('Hareer',    'ummul_kitab', 1, 2),
  ('Hareer',    'sifaat_old',  2, 1),
  ('Hareer',    'mudood',      3, 1),
  ('Hareer',    'mabadi',      3, 2),
  ('Salsabeel', 'qaidah',      1, 1),
  ('Salsabeel', 'ummul_kitab', 2, 1)
) as p(class_name, course_key, term_id, position)
join classes c on c.name = p.class_name
join courses co on co.key = p.course_key;

delete from class_homework_holds
where class_id in (select id from classes where name in ('Hareer', 'Salsabeel'));

insert into class_homework_holds (class_id, course_id)
select c.id, co.id from classes c, courses co
where c.name = 'Salsabeel' and co.key = 'qaidah'
on conflict do nothing;
