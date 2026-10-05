-- 2026/27 Term 1, week 1: the deadline moves from Monday 5 October 17:00 to
-- Thursday 8 October 20:15 UK time, for this week only (the programme lead,
-- 5 Oct, after a release mid-deadline stopped a student handing in).
--
-- Week 1's row is the deadline every brothers' class reads for its week-1
-- items (class_item_due_at); Homework 1 and Umm al-Kitāb 1 also carry it as
-- their own fallback date. The sisters' week 1 (section_weeks, from Wed 7 Oct)
-- is not touched.
--
-- Then any week-1 hand-in flagged late but in before the new deadline is no
-- longer late. Only clears flags; nothing is made late.

update weeks
   set due_at = timestamp '2026-10-08 20:15' at time zone 'Europe/London'
 where term_id = 1 and number = 1
returning number, due_at;

update homeworks h
   set due_at = timestamp '2026-10-08 20:15' at time zone 'Europe/London'
  from weeks w
 where w.id = h.week_id and w.term_id = 1 and w.number = 1
   and h.due_at = timestamp '2026-10-05 17:00' at time zone 'Europe/London'
returning h.number, h.due_at;

update submissions s
   set is_late = false
 where s.is_late
   and s.submitted_at is not null
   and public.homework_due_for(s.homework_id, s.student_id) = timestamp '2026-10-08 20:15' at time zone 'Europe/London'
   and s.submitted_at <= timestamp '2026-10-08 20:15' at time zone 'Europe/London'
returning s.id, s.homework_id, s.submitted_at;
