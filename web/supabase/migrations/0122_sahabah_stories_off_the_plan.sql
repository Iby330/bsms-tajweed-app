-- Sahabah Stories leaves every class's plan (owner, 2026-10-25): its videos
-- are in Resources now (0121), so it is no longer a course a class takes in
-- each term (0095), with a week, a place in the calendar and a slot to open.
-- The courses stay: Resources plays sahabah_t1's lessons. Mirrors COURSES and
-- SYLLABUS in lib/curriculum/syllabus.ts.
delete from class_courses cc
 using courses co
 where co.id = cc.course_id and co.key in ('sahabah_t1', 'sahabah_t2', 'sahabah_t3')
returning (select name from classes where id = cc.class_id) as class, co.key;
