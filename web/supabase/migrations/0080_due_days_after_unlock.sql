-- A class can have a course due a fixed number of days after each item opens,
-- instead of with its week.
--
-- Masjid Al-Aqsa's Umm al-Kitab is due on Thursdays at 13:00, not on Sundays
-- like everyone else's (programme lead, 9 October): each item opens Thursday
-- 13:00 and is due the next Thursday 13:00. `due_days_after_unlock` on the
-- class's plan row says so; class_item_due_at honours it, counting the days in
-- UK local time so the October clock change keeps it at 13:00. The app's
-- countdown mirrors it (scheduledDueAt). Null keeps every other course as it
-- was. Week 1 is past and handed in; nothing already stamped is re-stamped.

alter table class_courses add column if not exists due_days_after_unlock integer
  check (due_days_after_unlock is null or due_days_after_unlock between 1 and 60);
comment on column class_courses.due_days_after_unlock is
  'Due this many days after each item opens (UK local time) instead of with its week; null = with its week.';

create or replace function public.class_item_due_at(p_class uuid, p_course uuid, p_ordinal integer)
returns timestamptz language sql stable security definer set search_path = public as $$
  select case
    when cc.due_days_after_unlock is not null then
      ((class_item_unlock_at(p_class, p_course, p_ordinal) at time zone 'Europe/London')
        + cc.due_days_after_unlock * interval '1 day') at time zone 'Europe/London'
    else (
      with tw as (
        select w.number, coalesce(sw.due_at, w.due_at) as at
        from class_item_week(p_class, p_course, p_ordinal) iw
        join weeks w on w.term_id = iw.term_id
        left join section_weeks sw
          on sw.week_id = w.id and sw.section = (select section from classes where id = p_class)
      ), iw as (select * from class_item_week(p_class, p_course, p_ordinal))
      select coalesce(
        (select tw.at from tw, iw where tw.number = iw.week_number),
        (select max(tw.at) + (iw.week_number - max(tw.number)) * interval '7 days'
           from tw, iw group by iw.week_number)
      )
    )
  end
  from (select 1) one
  left join class_courses cc on cc.class_id = p_class and cc.course_id = p_course
$$;

update class_courses cc set due_days_after_unlock = 7
  from classes c, courses co
 where cc.class_id = c.id and cc.course_id = co.id
   and c.name = 'Masjid Al-Aqsa' and co.key = 'ummul_kitab'
returning cc.class_id, cc.due_days_after_unlock;
