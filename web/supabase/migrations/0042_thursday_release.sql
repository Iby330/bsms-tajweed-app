-- Pre-study: a week's content opens the Thursday before its class.
--
-- The tajweed class is on a Monday, and it teaches what the students have
-- already met: the video and the homework for Monday's topic open the
-- Thursday before at 13:00, the homework is due that Sunday at 18:00, and
-- Monday's class goes over it. So a week's `unlock_at` is the Thursday four
-- days before its Monday, and its homework's `due_at` the Sunday after that
-- Thursday. Both are written in London time, so 13:00 and 18:00 hold across
-- the clock change.
--
-- Week 1 of 2026/27 is the exception both ways. Its content opens by hand
-- the night it is ready (Friday 2 October), so its unlock_at is left on
-- Monday 5 October — a backstop — until it is set, and HW1 is due Monday
-- 5 October at 17:00.
--
-- A class with a syllabus took its item k from the term's FIRST week plus
-- seven days per item. With week 1 opened on a Friday night, that would have
-- put every later item on a Friday night too. Item k now opens with the
-- term's k-th week, which is what the formula meant all along, and past the
-- term's last week it carries on a week at a time as it always did. The app's
-- copy of this rule (scheduledUnlockAt, lib/curriculum/tree.ts) changes with
-- it.

-- the deadlines first, while every week still unlocks on its Monday
update homeworks h
set due_at = case
  when w.term_id = 1 and w.number = 1
    then timestamp '2026-10-05 17:00' at time zone 'Europe/London'
  else ((date_trunc('week', w.unlock_at at time zone 'Europe/London')::date - 1)
        + time '18:00') at time zone 'Europe/London'
end
from weeks w
where w.id = h.week_id;

update weeks
set unlock_at = ((date_trunc('week', unlock_at at time zone 'Europe/London')::date - 4)
                 + time '13:00') at time zone 'Europe/London'
where not (term_id = 1 and number = 1)
  and extract(isodow from unlock_at at time zone 'Europe/London') = 1;

create or replace function public.class_item_unlock_at(p_class uuid, p_course uuid, p_ordinal integer)
returns timestamptz language sql stable security definer set search_path = public as $$
  with term_weeks as (
    select w.unlock_at, row_number() over (order by w.unlock_at) as k
    from class_courses cc join weeks w on w.term_id = cc.term_id
    where cc.class_id = p_class and cc.course_id = p_course
  )
  select coalesce(
    (select unlock_at from term_weeks where k = greatest(p_ordinal, 1)),
    (select max(unlock_at) + (greatest(p_ordinal, 1) - max(k)) * interval '7 days' from term_weeks)
  )
$$;
