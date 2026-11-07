-- Qāʿidah homework 9 (309, the Ash-Shams rule hunt) opens now for Masjid
-- Al-Aqsa and is due on Monday 9 November, 14:00 UK time (Ibrahim, 7 Nov). Its
-- term-1 week 9 would otherwise open it on 30 November. Salsabeel's Qāʿidah
-- homework stays held (0090).
--
-- On the class's own schedule (0108), so its teacher can move either date from
-- the curriculum page, and a student who joins later reads the same deadline.
--
-- Idempotent.

insert into class_item_dates (class_id, course_id, ordinal, opens_at, due_at, held)
select c.id, k.id, 9,
       timestamp '2026-11-07 00:00' at time zone 'Europe/London',
       timestamp '2026-11-09 14:00' at time zone 'Europe/London',
       false
  from classes c, courses k
 where c.name = 'Masjid Al-Aqsa' and k.key = 'qaidah'
on conflict (class_id, course_id, ordinal) do update
  set opens_at = excluded.opens_at, due_at = excluded.due_at, held = excluded.held, set_at = now();

select c.name, class_item_unlock_at(c.id, k.id, 9) as opens_at, class_item_due_at(c.id, k.id, 9) as due_at
  from classes c, courses k
 where c.name in ('Masjid Al-Aqsa', 'Salsabeel') and k.key = 'qaidah';
