-- The brothers' homework is due Monday 14:00, from now on (programme lead,
-- 10 October), not Sunday 18:00. Every week still due Sunday 18:00 UK time
-- moves to the next day at 14:00, in UK local time (0042 set Sunday 18:00);
-- week 1 of Term 1, due Thursday 8 October by hand (0060), is past and stays.
-- The homework rows carry their week's deadline as their own fallback, so
-- those that still match move with it. The sisters run on section_weeks
-- (Tuesday 18:00, 0070) and Masjid Al-Aqsa's Umm al-Kitab on its own rule
-- (Thursday 13:00, 0080); neither reads these. Nothing already handed in is
-- re-stamped, and every week moved is in the future.

update homeworks h
   set due_at = ((((w.due_at at time zone 'Europe/London')::date + 1) + time '14:00') at time zone 'Europe/London')
  from weeks w
 where w.id = h.week_id and h.due_at = w.due_at
   and extract(isodow from w.due_at at time zone 'Europe/London') = 7
   and (w.due_at at time zone 'Europe/London')::time = '18:00';

update weeks
   set due_at = ((((due_at at time zone 'Europe/London')::date + 1) + time '14:00') at time zone 'Europe/London')
 where extract(isodow from due_at at time zone 'Europe/London') = 7
   and (due_at at time zone 'Europe/London')::time = '18:00'
returning term_id, number, due_at;
