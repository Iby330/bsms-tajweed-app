-- Qāʿidah homework 3 (303) opens now for Masjid Al-Aqsa and is due today,
-- Thursday 15 October, 20:15 UK time (Ibrahim, 15 Oct). Its term-1 week 3
-- would otherwise open it at 13:00 today and close it Monday 19 October.
--
-- No per-paper date exists for a class, so two existing levers:
--   * class_course_items files paper 3 under Al-Aqsa's week 2, which opened
--     on 8 October, so it is released at once. Other classes, and Al-Aqsa's
--     other courses, are untouched.
--   * week 2's deadline (12 October) has passed, so each Al-Aqsa student gets
--     an extension to 20:15 today: homework_due_for reads it first, so the
--     late stamp and the countdown both use it.
-- A student who joins Al-Aqsa later has no extension and would read 12 Oct;
-- give them one from the teacher's homework page.
--
-- Idempotent.

begin;

insert into class_course_items (class_id, course_id, ordinal, week_number)
select c.id, k.id, 3, 2
  from classes c, courses k
 where c.name = 'Masjid Al-Aqsa' and k.key = 'qaidah'
on conflict (class_id, course_id, ordinal) do update set week_number = excluded.week_number;

insert into homework_extensions (homework_id, student_id, due_at)
select h.id, p.id, timestamp '2026-10-15 20:15' at time zone 'Europe/London'
  from homeworks h, profiles p, classes c
 where h.number = 303 and c.name = 'Masjid Al-Aqsa'
   and p.class_id = c.id and p.role = 'student'
on conflict (homework_id, student_id) do update set due_at = excluded.due_at;

commit;

select p.full_name, homework_due_for(h.id, p.id) as due_at,
       class_item_unlock_at(p.class_id, h.course_id, h.ordinal) as unlock_at
  from homeworks h, profiles p, classes c
 where h.number = 303 and c.name = 'Masjid Al-Aqsa' and p.class_id = c.id and p.role = 'student'
 order by 1;
