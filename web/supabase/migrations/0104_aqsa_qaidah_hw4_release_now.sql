-- Qāʿidah homework 4 (304) opens now for Masjid Al-Aqsa and is due Monday
-- 19 October, 20:00 UK time (Ibrahim, 17 Oct): it is this week's paper, out
-- late, so it gets until 20:00 instead of the brothers' 14:00. Its term-1
-- week 4 would otherwise open it Thursday 22 October and close it 26 October.
--
-- The same two levers as 0098:
--   * class_course_items files paper 4 under Al-Aqsa's week 3, which opened
--     on 15 October, so it is released at once and is due with week 3
--     (Monday 19 October 14:00).
--   * each Al-Aqsa student gets an extension to 20:00 that day:
--     homework_due_for reads it first, so the late stamp and the countdown
--     both use it.
-- A student who joins Al-Aqsa later has no extension and would read 14:00;
-- give them one from the teacher's homework page. Salsabeel's Qāʿidah
-- homework stays held (0090).
--
-- Idempotent.

begin;

insert into class_course_items (class_id, course_id, ordinal, week_number)
select c.id, k.id, 4, 3
  from classes c, courses k
 where c.name = 'Masjid Al-Aqsa' and k.key = 'qaidah'
on conflict (class_id, course_id, ordinal) do update set week_number = excluded.week_number;

insert into homework_extensions (homework_id, student_id, due_at)
select h.id, p.id, timestamp '2026-10-19 20:00' at time zone 'Europe/London'
  from homeworks h, profiles p, classes c
 where h.number = 304 and c.name = 'Masjid Al-Aqsa'
   and p.class_id = c.id and p.role = 'student'
on conflict (homework_id, student_id) do update set due_at = excluded.due_at;

commit;

select p.full_name, homework_due_for(h.id, p.id) as due_at,
       class_item_unlock_at(p.class_id, h.course_id, h.ordinal) as unlock_at
  from homeworks h, profiles p, classes c
 where h.number = 304 and c.name = 'Masjid Al-Aqsa' and p.class_id = c.id and p.role = 'student'
 order by 1;
