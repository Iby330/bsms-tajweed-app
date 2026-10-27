-- Qāʿidah homeworks 6 (306) and 7 (307) open now for Masjid Al-Aqsa and are
-- due on Thursday 29 October, 19:15 UK time (Ibrahim, 27 Oct). Their term-1
-- weeks 6 and 7 would otherwise open them on 9 and 16 November.
--
-- The same levers as 0104 and 0107:
--   * class_course_items files papers 6 and 7 under Al-Aqsa's week 3, which
--     opened on 19 October, so they are released at once.
--   * each Al-Aqsa student gets an extension to Thursday 19:15 on both.
-- A student who joins Al-Aqsa later has no extension and would read week 3's
-- deadline (Thursday 29 October 14:00); give them one from the teacher's
-- homework page. Salsabeel's Qāʿidah homework stays held (0090).
--
-- Idempotent.

begin;

insert into class_course_items (class_id, course_id, ordinal, week_number)
select c.id, k.id, o.ordinal, 3
  from classes c, courses k, (values (6), (7)) o(ordinal)
 where c.name = 'Masjid Al-Aqsa' and k.key = 'qaidah'
on conflict (class_id, course_id, ordinal) do update set week_number = excluded.week_number;

insert into homework_extensions (homework_id, student_id, due_at)
select h.id, p.id, timestamp '2026-10-29 19:15' at time zone 'Europe/London'
  from homeworks h, profiles p, classes c
 where h.number in (306, 307) and c.name = 'Masjid Al-Aqsa'
   and p.class_id = c.id and p.role = 'student'
on conflict (homework_id, student_id) do update set due_at = excluded.due_at;

commit;

select h.number, p.full_name, homework_due_for(h.id, p.id) as due_at,
       class_item_unlock_at(p.class_id, h.course_id, h.ordinal) as unlock_at
  from homeworks h, profiles p, classes c
 where h.number in (306, 307) and c.name = 'Masjid Al-Aqsa' and p.class_id = c.id and p.role = 'student'
 order by 1, 2;
