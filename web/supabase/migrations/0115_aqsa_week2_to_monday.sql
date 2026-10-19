-- Masjid Al-Aqsa (Moadh Hwessa's class) gets the three homeworks due on
-- Thursday 15 October until Monday 19 October 14:00 UK time, week 2's own
-- deadline hour (programme lead, 16 October): HW 202 Al-Istiʿādhah (class
-- deadline 13:00), and HW 16 Mudūd Overview and HW 303 The Short Vowels and
-- Tanwīn (20:15 extensions from 0095 and 0098). HW 302 and week 3 are
-- untouched.
--
-- One extension (0067) per student in the class today; it replaces the
-- 20:15 ones. Work already handed in keeps its late mark. A student who
-- joins later reads the class deadline and needs one by hand. Re-running
-- moves them back to this date. Idempotent.

insert into homework_extensions (homework_id, student_id, due_at)
select h.id, p.id, '2026-10-19 14:00 Europe/London'
  from homeworks h
  cross join profiles p
  join classes c on c.id = p.class_id
 where c.name = 'Masjid Al-Aqsa' and p.role = 'student' and p.is_active
   and h.id in ('4f9b1a0a-6651-44a3-a845-d77d88e65c37',  -- HW 202
                '0f17735e-c16b-499d-acb1-a172578e6cf2',  -- HW 16
                'a4aed847-89c7-4f6b-b92f-a08cf35146a2')  -- HW 303
on conflict (homework_id, student_id)
  do update set due_at = excluded.due_at, granted_at = now()
returning homework_id, student_id, due_at;
