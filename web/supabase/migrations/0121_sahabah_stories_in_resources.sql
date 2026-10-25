-- Sahabah Stories in every class's Resources (owner, 2026-10-25): the
-- halaqah's videos are something to go back to, not a week's work. One set,
-- the Term 1 course (0095), which holds every session so far; later sessions
-- go in it too, by ordinal. After the class's other resources.
insert into class_resources (class_id, course_id, position)
select cl.id, co.id,
       coalesce((select max(r.position) from class_resources r where r.class_id = cl.id), 0) + 1
  from classes cl, courses co
 where co.key = 'sahabah_t1'
on conflict (class_id, course_id) do nothing
returning (select name from classes where id = class_id) as class, position;
