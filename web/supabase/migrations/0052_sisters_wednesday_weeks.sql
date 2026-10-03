-- The sisters run on a rolling Wednesday week.
--
-- The sisters' classes meet on different days (hifdh Monday, tajweed on
-- Wednesday for most), so pre-study on a fixed weekday cannot suit them all.
-- Instead each week's videos and homework open on Wednesday at 19:00, after
-- the tajweed lesson, and the homework is due the next Wednesday at 19:00 —
-- seven full days whatever day a class meets (programme lead, 2026-10-03).
-- The brothers keep 0042's Thursday 13:00 / Sunday 18:00.
--
-- `section_weeks` gives a section its own unlock and due for a week. Where a
-- section has no row, the week's own times stand, so the brothers read
-- exactly what they did. Every reader goes through it: class_item_unlock_at /
-- class_item_due_at for a class with a syllabus (by the class's section),
-- and can_see_content / homework_due_for for one without (by the reader's).
-- The app mirrors it (sectionWeeks in lib/curriculum).
--
-- Week n's class Monday is the Monday on or after its unlock (Thursday + 4
-- for weeks 0042 moved; week 1, opened by hand, still falls in the week of
-- Monday 5 October). The sisters' week n opens that Wednesday and is due the
-- next. Week 1 of Term 1 opens for the sisters by hand, like the brothers';
-- its row below is the backstop if nobody does: Wednesday 7 October 19:00.

create table if not exists section_weeks (
  section section_t not null,
  week_id uuid not null references weeks(id) on delete cascade,
  unlock_at timestamptz not null,
  due_at timestamptz not null,
  primary key (section, week_id)
);

comment on table section_weeks is
  'A section''s own unlock/due for a week, overriding weeks.unlock_at/due_at for its readers.';

alter table section_weeks enable row level security;
revoke all on section_weeks from anon;
drop policy if exists s_section_weeks_read on section_weeks;
create policy s_section_weeks_read on section_weeks for select using (auth.uid() is not null);
drop policy if exists t_section_weeks on section_weeks;
create policy t_section_weeks on section_weeks
  for all using (is_teacher()) with check (is_teacher());

insert into section_weeks (section, week_id, unlock_at, due_at)
select 'sisters', w.id,
       ((m.monday + 2) + time '19:00') at time zone 'Europe/London',
       ((m.monday + 9) + time '19:00') at time zone 'Europe/London'
from weeks w
cross join lateral (
  select (w.unlock_at at time zone 'Europe/London')::date
         + ((8 - extract(isodow from w.unlock_at at time zone 'Europe/London')::int) % 7) as monday
) m
on conflict (section, week_id) do update
  set unlock_at = excluded.unlock_at, due_at = excluded.due_at;

-- ── a class with a syllabus: its section's times ────────────────────────

create or replace function public.class_item_unlock_at(p_class uuid, p_course uuid, p_ordinal integer)
returns timestamptz language sql stable security definer set search_path = public as $$
  with tw as (
    select w.number, coalesce(sw.unlock_at, w.unlock_at) as at
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
$$;

create or replace function public.class_item_due_at(p_class uuid, p_course uuid, p_ordinal integer)
returns timestamptz language sql stable security definer set search_path = public as $$
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
$$;

-- ── a reader without a syllabus: their own section's times ──────────────

create or replace function public.can_see_content(p_course uuid, p_ordinal integer, p_week uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with me as (select class_id, section from profiles where id = auth.uid())
  select case
    -- Class has a syllabus: it decides, and a course the class does not take
    -- yields NULL from class_item_unlock_at, which is "never".
    when exists (select 1 from class_courses cc, me where cc.class_id = me.class_id)
      then coalesce(
        (select class_item_unlock_at(me.class_id, p_course, greatest(coalesce(p_ordinal, 1), 1))
           from me) <= now(),
        false)
    -- No syllabus: the week-based rule, at the reader's section's time.
    else exists (
      select 1 from weeks w
      left join section_weeks sw on sw.week_id = w.id and sw.section = (select section from me)
      where w.id = p_week and coalesce(sw.unlock_at, w.unlock_at) <= now())
  end;
$$;

create or replace function public.homework_due_for(p_hw uuid, p_student uuid)
returns timestamptz language sql stable security definer set search_path = public as $$
  select coalesce(
    (select class_item_due_at(p.class_id, h.course_id, h.ordinal)
       from profiles p
      where p.id = p_student
        and exists (select 1 from class_courses cc where cc.class_id = p.class_id)),
    (select sw.due_at from section_weeks sw join profiles p on p.section = sw.section
      where p.id = p_student and sw.week_id = h.week_id),
    h.due_at)
  from homeworks h where h.id = p_hw
$$;
