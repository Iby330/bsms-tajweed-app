-- Masjid Al-Aqsa watches Ṣifāt's Qalqala and Hams videos (Tajweed 12 and 13,
-- homework 12 Qalqala and 13 Hams), open now and due Monday 19 October 20:00
-- UK time (Moadh Hwessa via programme lead, 17 October). Only those two
-- items: the rest of Ṣifāt is not on Al-Aqsa's plan yet.
--
-- Same levers as 0095 (Mudūd): Ṣifāt joins Al-Aqsa's Term 1 after Mudūd.
-- Items 4 and 5 meet in week 2 (opened Thursday 8 October), so they are open
-- now; items 1–3, 6 and 7 are parked in week 99, past the term's end, so
-- neither their videos nor their homework open. To give the class another
-- Ṣifāt item, move its row to a real week.
--
-- Week 2's own deadline has passed, so the Monday deadline is an extension
-- (0067) for each student in the class today. A student who joins later
-- reads week 2's deadline and needs one by hand.
--
-- Every statement idempotent so a half-applied batch can be re-run.

begin;

insert into class_courses (class_id, course_id, term_id, position)
select c.id, co.id, 1, 4 from classes c, courses co
 where c.name = 'Masjid Al-Aqsa' and co.key = 'sifaat_old'
on conflict (class_id, course_id) do update set term_id = 1, position = 4;

insert into class_course_items (class_id, course_id, ordinal, week_number)
select c.id, co.id, o, case when o in (4, 5) then 2 else 99 end
  from classes c, courses co, generate_series(1, 7) o
 where c.name = 'Masjid Al-Aqsa' and co.key = 'sifaat_old'
on conflict (class_id, course_id, ordinal) do update set week_number = excluded.week_number;

insert into homework_extensions (homework_id, student_id, due_at)
select h.id, p.id, timestamp '2026-10-19 20:00' at time zone 'Europe/London'
  from homeworks h
  join courses co on co.id = h.course_id
  cross join profiles p
  join classes c on c.id = p.class_id
 where co.key = 'sifaat_old' and h.ordinal in (4, 5)
   and c.name = 'Masjid Al-Aqsa' and p.role = 'student' and p.is_active
on conflict (homework_id, student_id) do update set due_at = excluded.due_at, granted_at = now();

commit;

select h.number, p.full_name,
       class_item_unlock_at(p.class_id, h.course_id, h.ordinal) as unlock_at,
       homework_due_for(h.id, p.id) as due_at
  from homeworks h
  join courses co on co.id = h.course_id
  cross join profiles p
  join classes c on c.id = p.class_id
 where co.key = 'sifaat_old' and c.name = 'Masjid Al-Aqsa'
   and p.role = 'student' and p.is_active
 order by 1, 2;
