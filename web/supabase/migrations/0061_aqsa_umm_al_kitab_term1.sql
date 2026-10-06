-- Masjid Al-Aqsa start Umm al-Kitāb now, in Term 1, alongside Qāʿidah.
--
-- 0056 had them take it in Term 2. Their teacher (Moadh) asked on 2026-10-06
-- to begin straight away, one episode a week, "apart from week 5 where we will
-- cover both episode 5 and 6 as they are short ayah and we need the extra
-- week". So episodes 5 and 6 share week 5 and 7–9 each come a week early.
-- Al-Aqsa only: Hareer keeps Term 2, Al-Haram keeps item k = week k.
--
-- Episode 1 (and HW 201) therefore opens at once, due with the rest of week 1
-- on Thursday 8 October 20:15 (0060).

update class_courses cc
   set term_id = 1, position = 2
  from classes c, courses co
 where cc.class_id = c.id and cc.course_id = co.id
   and c.name = 'Masjid Al-Aqsa' and co.key = 'ummul_kitab'
returning cc.class_id, cc.term_id;

insert into class_course_items (class_id, course_id, ordinal, week_number)
select c.id, co.id, v.ordinal, v.week_number
  from (values (6, 5), (7, 6), (8, 7), (9, 8)) as v(ordinal, week_number)
  join classes c on c.name = 'Masjid Al-Aqsa'
  join courses co on co.key = 'ummul_kitab'
on conflict (class_id, course_id, ordinal) do update
  set week_number = excluded.week_number
returning ordinal, week_number;
