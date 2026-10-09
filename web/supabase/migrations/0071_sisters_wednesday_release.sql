-- The sisters' week opens Wednesday 18:00 and is due the next Tuesday 18:00
-- (programme lead, confirmed 9 October). 0070 set the Tuesday deadlines and,
-- with the release day unsettled, opened each week at the deadline before it;
-- this moves every opening that is still a Tuesday to the Wednesday after,
-- 18:00 UK time. Week 1 and this week's week 2 (Friday 9 October 18:00) are
-- not Tuesdays and keep their times. Deadlines are untouched. Idempotent.

update section_weeks sw
   set unlock_at = ((sw.unlock_at at time zone 'Europe/London') + interval '1 day') at time zone 'Europe/London'
 where sw.section = 'sisters'
   and extract(isodow from sw.unlock_at at time zone 'Europe/London') = 2
   and (sw.unlock_at at time zone 'Europe/London')::time = '18:00'
returning sw.week_id, sw.unlock_at, sw.due_at;
