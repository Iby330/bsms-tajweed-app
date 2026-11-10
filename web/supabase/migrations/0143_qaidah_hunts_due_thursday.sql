-- Both rule hunts are due on Thursday 12 November, 14:00 UK, for Masjid
-- Al-Aqsa (Ibrahim, 10 Nov): Ash-Shams (309, was Monday 9 Nov 14:00) and
-- Az-Zalzalah (310), which opens now. 14:00 Thursday is the deadline Moadh sets
-- for his class's other homework.
--
-- On the class's own schedule (0108), as a teacher's change from the
-- curriculum page would be, and like that change it clears "late" on any
-- hand-in the later deadline now covers (clear_late_for_class_ids, 0109):
-- the Ash-Shams papers handed in on Monday evening.
--
-- Idempotent.

insert into class_item_dates (class_id, course_id, ordinal, opens_at, due_at, held)
select c.id, k.id, o.ordinal, o.opens, timestamp '2026-11-12 14:00' at time zone 'Europe/London', false
  from classes c, courses k,
       (values (9,  timestamp '2026-11-07 00:00' at time zone 'Europe/London'),
               (10, timestamp '2026-11-10 00:00' at time zone 'Europe/London')) o(ordinal, opens)
 where c.name = 'Masjid Al-Aqsa' and k.key = 'qaidah'
on conflict (class_id, course_id, ordinal) do update
  set opens_at = excluded.opens_at, due_at = excluded.due_at, held = excluded.held, set_at = now();

select clear_late_for_class_ids(id) as cleared from classes where name = 'Masjid Al-Aqsa';

select h.number, class_item_unlock_at(c.id, h.course_id, h.ordinal) as opens_at,
       class_item_due_at(c.id, h.course_id, h.ordinal) as due_at,
       (select count(*) from submissions s where s.homework_id = h.id and s.is_late) as late
  from homeworks h, classes c
 where h.number in (309, 310) and c.name = 'Masjid Al-Aqsa'
 order by 1;
