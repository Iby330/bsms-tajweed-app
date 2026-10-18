-- A class's own schedule, set by its teacher from the curriculum page.
--
-- Until now an item opened and fell due with its week, and the only ways to
-- change that for one class were whole weeks (class_course_items), a course
-- hold (class_homework_holds) or an extension per student. Every "open this
-- now" or "due at class time" became a migration (0098, 0104). This adds:
--
--   * class_item_dates: one item's own opening, deadline and hold, per class;
--   * a class default for when things open and when homework is due
--     (classes.open_* / due_*), which every item without its own date follows;
--   * class_added_items: a video or homework from a course the class does not
--     take, added to one of its weeks.
--
-- Precedence, for one item of one class:
--   opens: its own date, else the class's opening default for its week, else
--          the week calendar (section_weeks / weeks), as before;
--   due:   its own date, else the class's due default after it opens, else
--          due_days_after_unlock (0080), else the week calendar, as before;
--   held:  its own hold, else the course hold (0090). A held item is hidden,
--          video and homework both.
--
-- With no rows in the new tables and the new columns null, every function
-- below returns exactly what it did before; the parity check
-- (execution/schedule_parity.ts) compares the app with the database.
--
-- Every statement idempotent.

-- ── Tables ──────────────────────────────────────────────────────────────

create table if not exists class_item_dates (
  class_id  uuid not null references classes(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  ordinal   integer not null check (ordinal >= 1),
  opens_at  timestamptz,
  due_at    timestamptz,
  held      boolean,              -- null: no opinion, the course hold decides
  set_by    uuid references profiles(id) on delete set null,
  set_at    timestamptz not null default now(),
  primary key (class_id, course_id, ordinal),
  check (opens_at is not null or due_at is not null or held is not null)
);
comment on table class_item_dates is
  'One item''s own opening, deadline and hold for one class; null fields follow the class default and the week calendar.';

create table if not exists class_added_items (
  class_id    uuid not null references classes(id) on delete cascade,
  course_id   uuid not null references courses(id) on delete cascade,
  ordinal     integer not null check (ordinal >= 1),
  term_id     integer not null,
  week_number integer not null check (week_number >= 1),
  added_by    uuid references profiles(id) on delete set null,
  added_at    timestamptz not null default now(),
  primary key (class_id, course_id, ordinal)
);
comment on table class_added_items is
  'A video or homework from a course the class does not take, added to one of its weeks.';

alter table class_item_dates enable row level security;
alter table class_added_items enable row level security;
revoke all on class_item_dates from anon;
revoke all on class_added_items from anon;

-- Signed-in read, as class_course_items: the app mirrors these dates on the
-- student's own screens. A held item's rows stay hidden by the content policies.
drop policy if exists s_class_item_dates_read on class_item_dates;
create policy s_class_item_dates_read on class_item_dates for select using (auth.uid() is not null);
drop policy if exists t_class_item_dates on class_item_dates;
create policy t_class_item_dates on class_item_dates for all using (is_teacher()) with check (is_teacher());

drop policy if exists s_class_added_items_read on class_added_items;
create policy s_class_added_items_read on class_added_items for select using (auth.uid() is not null);
drop policy if exists t_class_added_items on class_added_items;
create policy t_class_added_items on class_added_items for all using (is_teacher()) with check (is_teacher());

-- The class default: weekday 0 = Sunday … 6 = Saturday, times on the UK clock.
alter table classes add column if not exists open_weekday smallint check (open_weekday between 0 and 6);
alter table classes add column if not exists open_time time;
alter table classes add column if not exists due_weekday smallint check (due_weekday between 0 and 6);
alter table classes add column if not exists due_time time;
alter table classes add column if not exists due_weeks_after smallint not null default 0 check (due_weeks_after between 0 and 8);

-- ── Which week a class meets an item in ────────────────────────────────

-- 0044's body, plus an added item of a course the class does not take.
create or replace function public.class_item_week(p_class uuid, p_course uuid, p_ordinal integer)
returns table(term_id integer, week_number integer)
language sql stable security definer set search_path = public as $$
  select cc.term_id,
         coalesce(i.week_number, greatest(p_ordinal, 1))
  from class_courses cc
  left join class_course_items i
    on i.class_id = cc.class_id and i.course_id = cc.course_id
   and i.ordinal = greatest(p_ordinal, 1)
  where cc.class_id = p_class and cc.course_id = p_course
  union all
  select a.term_id, a.week_number
  from class_added_items a
  where a.class_id = p_class and a.course_id = p_course
    and a.ordinal = greatest(coalesce(p_ordinal, 1), 1)
    and not exists (select 1 from class_courses cc where cc.class_id = p_class and cc.course_id = p_course)
$$;

-- ── When it opens ──────────────────────────────────────────────────────

-- The week calendar's opening for the item, 0052's body unchanged.
create or replace function public.class_item_calendar_unlock_at(p_class uuid, p_course uuid, p_ordinal integer)
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

-- The week calendar's deadline for the item: the week's due, as 0052.
create or replace function public.class_item_calendar_due_at(p_class uuid, p_course uuid, p_ordinal integer)
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

-- The first p_weekday at p_time (UK clock) strictly after p_after, plus
-- p_weeks weeks on the same UK wall clock.
create or replace function public.next_weekday_at(p_after timestamptz, p_weekday integer, p_time time, p_weeks integer default 0)
returns timestamptz language sql immutable set search_path = public as $$
  with local as (select (p_after at time zone 'Europe/London') as t),
  cand as (
    select (date_trunc('day', t) + ((p_weekday - extract(dow from t)::int + 7) % 7) * interval '1 day' + p_time) as c, t from local
  )
  select ((case when c > t then c else c + interval '7 days' end) + p_weeks * interval '7 days') at time zone 'Europe/London'
  from cand
$$;

-- The class's opening default for an item: the first open weekday and time
-- in the seven days before the week calendar's deadline for it. Brothers'
-- week 3 is due Monday 19 October 14:00, so "Thursday 13:00" opens it on
-- Thursday 15 October; sisters' week 3 is due Tuesday 20 October 18:00, so
-- "Wednesday 18:00" opens it on Wednesday 14 October.
create or replace function public.class_rule_unlock_at(p_class uuid, p_course uuid, p_ordinal integer)
returns timestamptz language sql stable security definer set search_path = public as $$
  select case when c.open_weekday is null or c.open_time is null then null else
    next_weekday_at(class_item_calendar_due_at(p_class, p_course, p_ordinal) - interval '7 days',
                    c.open_weekday, c.open_time, 0)
  end
  from classes c where c.id = p_class
$$;

-- When the item opens for the class: its own date, else the class default,
-- else the week calendar.
create or replace function public.class_item_unlock_at(p_class uuid, p_course uuid, p_ordinal integer)
returns timestamptz language sql stable security definer set search_path = public as $$
  select coalesce(
    (select d.opens_at from class_item_dates d
      where d.class_id = p_class and d.course_id = p_course
        and d.ordinal = greatest(coalesce(p_ordinal, 1), 1)),
    class_rule_unlock_at(p_class, p_course, p_ordinal),
    class_item_calendar_unlock_at(p_class, p_course, p_ordinal)
  )
  -- only for an item the class meets at all
  where exists (select 1 from class_item_week(p_class, p_course, p_ordinal))
$$;

-- ── When it is due ─────────────────────────────────────────────────────

-- Its own date, else the class's due default after it opens, else 0080's
-- days-after-opening, else the week calendar.
create or replace function public.class_item_due_at(p_class uuid, p_course uuid, p_ordinal integer)
returns timestamptz language sql stable security definer set search_path = public as $$
  select coalesce(
    (select d.due_at from class_item_dates d
      where d.class_id = p_class and d.course_id = p_course
        and d.ordinal = greatest(coalesce(p_ordinal, 1), 1)),
    case when c.due_weekday is not null and c.due_time is not null then
      next_weekday_at(class_item_unlock_at(p_class, p_course, p_ordinal), c.due_weekday, c.due_time, c.due_weeks_after)
    end,
    case when cc.due_days_after_unlock is not null then
      ((class_item_unlock_at(p_class, p_course, p_ordinal) at time zone 'Europe/London')
        + cc.due_days_after_unlock * interval '1 day') at time zone 'Europe/London'
    end,
    class_item_calendar_due_at(p_class, p_course, p_ordinal)
  )
  from classes c
  left join class_courses cc on cc.class_id = c.id and cc.course_id = p_course
  where c.id = p_class
    and exists (select 1 from class_item_week(p_class, p_course, p_ordinal))
$$;

-- ── Held ───────────────────────────────────────────────────────────────

-- The item's own hold, else the course hold. Keyed by class so the app and the
-- parity check can ask about any class, not only the reader's.
create or replace function public.class_item_held(p_class uuid, p_course uuid, p_ordinal integer)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select d.held from class_item_dates d
      where d.class_id = p_class and d.course_id = p_course
        and d.ordinal = greatest(coalesce(p_ordinal, 1), 1)),
    exists (
      select 1 from class_homework_holds h
      where h.class_id = p_class and h.course_id = p_course
        and greatest(coalesce(p_ordinal, 1), 1) >= h.from_ordinal))
$$;

-- 0090's reader-keyed form, now the same rule. s_homeworks_unlocked and the
-- paper RPC keep calling it.
create or replace function public.homework_held(p_course uuid, p_ordinal integer)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select class_item_held(p.class_id, p_course, p_ordinal)
       from profiles p where p.id = auth.uid() and p.class_id is not null),
    false)
$$;

-- 0052's body with the hold added, so a held item hides its video too
-- (s_lessons_unlocked calls this, and so does s_homeworks_unlocked).
create or replace function public.can_see_content(p_course uuid, p_ordinal integer, p_week uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with me as (select class_id, section from profiles where id = auth.uid())
  select case
    when exists (select 1 from class_courses cc, me where cc.class_id = me.class_id)
      then coalesce(
        (select class_item_unlock_at(me.class_id, p_course, greatest(coalesce(p_ordinal, 1), 1)) <= now()
                and not class_item_held(me.class_id, p_course, greatest(coalesce(p_ordinal, 1), 1))
           from me),
        false)
    else exists (
      select 1 from weeks w
      left join section_weeks sw on sw.week_id = w.id and sw.section = (select section from me)
      where w.id = p_week and coalesce(sw.unlock_at, w.unlock_at) <= now())
  end;
$$;

-- ── Late flags after a deadline moves later ─────────────────────────────

-- Clears "late" on a class's hand-ins that are now on time. Only clears;
-- nothing is ever made late here. Returns how many it cleared.
create or replace function public.clear_late_for_class(p_class uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update submissions s set is_late = false
    from profiles p
   where p.id = s.student_id and p.class_id = p_class
     and s.is_late and s.submitted_at is not null
     and s.submitted_at <= homework_due_for(s.homework_id, s.student_id);
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.class_item_calendar_unlock_at(uuid, uuid, integer) from public, anon;
revoke execute on function public.class_item_calendar_due_at(uuid, uuid, integer) from public, anon;
revoke execute on function public.class_rule_unlock_at(uuid, uuid, integer) from public, anon;
revoke execute on function public.class_item_held(uuid, uuid, integer) from public, anon;
revoke execute on function public.clear_late_for_class(uuid) from public, anon, authenticated;
grant execute on function public.class_item_calendar_unlock_at(uuid, uuid, integer) to authenticated, service_role;
grant execute on function public.class_item_calendar_due_at(uuid, uuid, integer) to authenticated, service_role;
grant execute on function public.class_rule_unlock_at(uuid, uuid, integer) to authenticated, service_role;
grant execute on function public.class_item_held(uuid, uuid, integer) to authenticated, service_role;
grant execute on function public.clear_late_for_class(uuid) to service_role;
