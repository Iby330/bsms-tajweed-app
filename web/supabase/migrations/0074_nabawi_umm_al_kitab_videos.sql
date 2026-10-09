-- Masjid An-Nabawi can watch the Umm al-Kitab videos, without its homework.
--
-- Group 1 does not take Umm al-Kitab (0045), but their teacher wants them able
-- to go back to its videos and point them to particular moments (programme
-- lead, 9 October). A class sees a course's lessons only through its plan
-- (can_see_content -> class_item_unlock_at), so the course joins An-Nabawi's
-- Term 1 plan, every one of its nine items is placed in week 1 so all of them
-- are open now (and none is listed as this week's work), and its homework is
-- held (class_homework_holds, 0066): neither listed nor openable for them.
-- Idempotent.

insert into class_courses (class_id, course_id, term_id, position)
select c.id, co.id, 1, 4 from classes c, courses co
 where c.name = 'Masjid An-Nabawi' and co.key = 'ummul_kitab'
on conflict (class_id, course_id) do update set term_id = 1, position = 4;

insert into class_course_items (class_id, course_id, ordinal, week_number)
select c.id, co.id, n, 1 from classes c, courses co, generate_series(1, 9) n
 where c.name = 'Masjid An-Nabawi' and co.key = 'ummul_kitab'
on conflict (class_id, course_id, ordinal) do update set week_number = 1;

insert into class_homework_holds (class_id, course_id)
select c.id, co.id from classes c, courses co
 where c.name = 'Masjid An-Nabawi' and co.key = 'ummul_kitab'
on conflict do nothing;

select (select count(*) from class_course_items i join classes c on c.id = i.class_id join courses co on co.id = i.course_id
         where c.name = 'Masjid An-Nabawi' and co.key = 'ummul_kitab') as items,
       (select count(*) from class_homework_holds h join classes c on c.id = h.class_id join courses co on co.id = h.course_id
         where c.name = 'Masjid An-Nabawi' and co.key = 'ummul_kitab') as held;
