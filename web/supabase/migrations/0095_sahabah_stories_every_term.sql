-- Sahabah Stories is taught this year: the weekly halaqah, in person for the
-- brothers and recorded for the sisters, with each session on YouTube and in
-- the app for both to look back on. Every class, every term (programme lead,
-- 2026-10-15). The curriculum page called it "Not running this year".
--
-- A class takes a course in exactly one term (class_courses' key), so it is
-- three courses, one a term, the way Tajweed is Ghunna, Ṣifāt and Mudūd. Their
-- lessons go in the `seerah` series with course_id and ordinal set, and open a
-- week at a time from the start of the term like every other course
-- (class_item_unlock_at). Mirrors COURSES and SYLLABUS in
-- lib/curriculum/syllabus.ts.

insert into courses (key, label, position) values
  ('sahabah_t1', 'Sahabah Stories', 9),
  ('sahabah_t2', 'Sahabah Stories', 10),
  ('sahabah_t3', 'Sahabah Stories', 11)
on conflict (key) do update set label = excluded.label, position = excluded.position;

-- Every class that has a syllabus. The demo classes have none and already see
-- the whole programme.
insert into class_courses (class_id, course_id, term_id, position)
select cl.id, co.id, t.term_id, 99
  from classes cl
  cross join (values (1), (2), (3)) as t(term_id)
  join courses co on co.key = 'sahabah_t' || t.term_id
 where exists (select 1 from class_courses cc where cc.class_id = cl.id)
on conflict (class_id, course_id) do update set term_id = excluded.term_id
returning (select name from classes where id = class_id) as class, term_id;
