-- The sisters' homework is due Tuesday 18:00, from now on (programme lead,
-- Friday 9 October). Their rolling week (0052) opened Wednesday 19:00 and was
-- due the next Wednesday 19:00.
--
-- This week, as the lead put it, "week 1 is over, week 2 now": week 2's videos
-- and homework open today at 18:00 and are due Tuesday 13 October 18:00, and
-- week 1 closes as week 2 opens. Every later Term 1 week then runs Tuesday to
-- Tuesday from there, still opening at the deadline before it (the release
-- day is not settled; this keeps the rolling week until it is). So Term 1's
-- last week, 10, is due Tuesday 8 December rather than Wednesday 16th.
--
-- Terms 2 and 3 keep their weeks and move from Wednesday 19:00 to Tuesday
-- 18:00, counted in UK local time so the clock change cannot shift an hour.
--
-- The brothers (weeks, no section row) are untouched. Lateness only follows
-- hand-ins from here on: nothing already handed in is re-stamped.

with t1 as (
  select w.id, w.number from weeks w where w.term_id = 1
)
update section_weeks sw
   set unlock_at = case
         when t1.number = 1 then sw.unlock_at
         when t1.number = 2 then timestamp '2026-10-09 18:00' at time zone 'Europe/London'
         else (timestamp '2026-10-13 18:00' + (t1.number - 3) * interval '7 days') at time zone 'Europe/London'
       end,
       due_at = case
         when t1.number = 1 then timestamp '2026-10-09 18:00' at time zone 'Europe/London'
         else (timestamp '2026-10-13 18:00' + (t1.number - 2) * interval '7 days') at time zone 'Europe/London'
       end
  from t1
 where sw.week_id = t1.id and sw.section = 'sisters'
returning t1.number, sw.unlock_at, sw.due_at;

update section_weeks sw
   set unlock_at = ((sw.unlock_at at time zone 'Europe/London') - interval '25 hours') at time zone 'Europe/London',
       due_at    = ((sw.due_at    at time zone 'Europe/London') - interval '25 hours') at time zone 'Europe/London'
  from weeks w
 where w.id = sw.week_id and w.term_id in (2, 3) and sw.section = 'sisters'
   and extract(isodow from sw.due_at at time zone 'Europe/London') = 3   -- still Wednesday: idempotent
returning w.term_id, w.number, sw.unlock_at, sw.due_at;
