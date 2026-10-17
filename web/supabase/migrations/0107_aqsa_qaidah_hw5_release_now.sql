-- Qāʿidah homework 5 (305) opens now for Masjid Al-Aqsa and is due with
-- homework 4 on Thursday 22 October, 20:00 UK time (Ibrahim, 17 Oct). Its
-- term-1 week 5 would otherwise open it 29 October.
--
-- The same levers as 0098 and 0104:
--   * class_course_items files paper 5 under Al-Aqsa's week 3, which opened
--     on 15 October, so it is released at once.
--   * each Al-Aqsa student gets an extension to Thursday 20:00 on 305, and
--     their extensions on 304 move from 20:15 (0105) to 20:00, so the two
--     papers close together.
-- A student who joins Al-Aqsa later has no extension and would read week 3's
-- deadline (Monday 19 October 14:00); give them one from the teacher's
-- homework page. Salsabeel's Qāʿidah homework stays held (0090).
--
-- Idempotent.

begin;

insert into class_course_items (class_id, course_id, ordinal, week_number)
select c.id, k.id, 5, 3
  from classes c, courses k
 where c.name = 'Masjid Al-Aqsa' and k.key = 'qaidah'
on conflict (class_id, course_id, ordinal) do update set week_number = excluded.week_number;

insert into homework_extensions (homework_id, student_id, due_at)
select h.id, p.id, timestamp '2026-10-22 20:00' at time zone 'Europe/London'
  from homeworks h, profiles p, classes c
 where h.number in (304, 305) and c.name = 'Masjid Al-Aqsa'
   and p.class_id = c.id and p.role = 'student'
on conflict (homework_id, student_id) do update set due_at = excluded.due_at;

commit;

select h.number, p.full_name, homework_due_for(h.id, p.id) as due_at,
       class_item_unlock_at(p.class_id, h.course_id, h.ordinal) as unlock_at
  from homeworks h, profiles p, classes c
 where h.number in (304, 305) and c.name = 'Masjid Al-Aqsa' and p.class_id = c.id and p.role = 'student'
 order by 1, 2;
