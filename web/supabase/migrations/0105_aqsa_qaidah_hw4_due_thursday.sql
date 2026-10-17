-- Qāʿidah homework 4 (304) for Masjid Al-Aqsa is due Thursday 22 October,
-- 20:15 UK time, Moadh's class time, instead of Monday 19 October 20:00
-- (Ibrahim, 17 Oct). 0104 filed the paper under week 3 so it opened at once;
-- that stays. Only the students' extensions move. Idempotent.

update homework_extensions e
   set due_at = timestamp '2026-10-22 20:15' at time zone 'Europe/London'
  from homeworks h, profiles p, classes c
 where e.homework_id = h.id and h.number = 304
   and e.student_id = p.id and p.class_id = c.id and c.name = 'Masjid Al-Aqsa';

select p.full_name, homework_due_for(h.id, p.id) as due_at
  from homeworks h, profiles p, classes c
 where h.number = 304 and c.name = 'Masjid Al-Aqsa' and p.class_id = c.id and p.role = 'student'
 order by 1;
