-- Salsabeel (Sajeda) does Qāʿidah homework 2 and 3 this week, with
-- Umm al-Kitab's Al-Basmalah (HW 203), all due Tuesday 20 October 18:00
-- (programme lead, 17 October).
--
-- Qāʿidah item 2 was in week 2 (sisters' deadline Tuesday 13 October) while
-- its homework was still held (0090), so it moves to week 3 alongside item 3:
-- week 3's sisters' deadline is Tuesday 20 October 18:00 (section_weeks,
-- 0070). Week 3 opened Wednesday 14 October, so lesson 2 stays visible. The
-- hold rises to 4, releasing HW 302 and 303; HW 304 on stays held. HW 203 is
-- already week 3's and is untouched.
--
-- Every statement idempotent so a half-applied batch can be re-run.

begin;

insert into class_course_items (class_id, course_id, ordinal, week_number)
select c.id, co.id, 2, 3 from classes c, courses co
 where c.name = 'Salsabeel' and co.key = 'qaidah'
on conflict (class_id, course_id, ordinal) do update set week_number = excluded.week_number;

update class_homework_holds hh set from_ordinal = 4
  from classes c, courses co
 where hh.class_id = c.id and hh.course_id = co.id
   and c.name = 'Salsabeel' and co.key = 'qaidah';

commit;

select co.key, h.number, iw.week_number,
       class_item_unlock_at(c.id, h.course_id, h.ordinal) as unlock_at,
       class_item_due_at(c.id, h.course_id, h.ordinal) as due_at,
       exists (select 1 from class_homework_holds hh
                where hh.class_id = c.id and hh.course_id = h.course_id
                  and h.ordinal >= hh.from_ordinal) as held
  from classes c
  join class_courses cc on cc.class_id = c.id
  join courses co on co.id = cc.course_id
  join homeworks h on h.course_id = co.id
  cross join lateral class_item_week(c.id, h.course_id, h.ordinal) iw
 where c.name = 'Salsabeel' and co.key in ('qaidah', 'ummul_kitab') and iw.week_number <= 4
 order by iw.week_number, co.key, h.ordinal;
