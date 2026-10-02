-- A class's own week for an item: "for this class, item N of course C opens
-- in week W of its term".
--
-- Until now item k of a course opened in week k of the term the class takes
-- it in (0042). Group 1 (Masjid An-Nabawi) does not run one item a week: it
-- takes Ghunna, Mudūd and Ṣifāt together in Term 1, 21 episodes across weeks
-- 1–8, several in a week. `class_course_items` names the week for any item a
-- class schedules differently; an item it does not list keeps item k = week k,
-- so groups 2–5 are untouched.
--
-- Weeks are named by `weeks.number` within the term (1-based). Past the
-- term's last week an item carries on a week at a time, as before.
--
-- Both the opening and the deadline read through here, so a listed item opens
-- with its week (Thursday 13:00) and is due with it (that Sunday 18:00). The
-- app's copy is scheduledUnlockAt / scheduledDueAt in lib/curriculum/tree.ts.
--
-- Also: Ṣifāt (new) moves into Group 1's Term 1 with Ghunna and Mudūd, per
-- the programme lead, 2026-10-02. A class takes a course in one term, so it
-- leaves Term 2, which is empty for Group 1 until it is decided.

create table if not exists class_course_items (
  class_id uuid not null references classes(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  ordinal integer not null check (ordinal >= 1),
  week_number integer not null check (week_number >= 1),
  primary key (class_id, course_id, ordinal)
);

comment on table class_course_items is
  'Per-class week for a course item, where it differs from item k = week k. '
  'week_number is weeks.number within the term the class takes the course in.';

alter table class_course_items enable row level security;
revoke all on class_course_items from anon;
drop policy if exists s_class_course_items_read on class_course_items;
create policy s_class_course_items_read on class_course_items
  for select using (auth.uid() is not null);
drop policy if exists t_class_course_items on class_course_items;
create policy t_class_course_items on class_course_items
  for all using (is_teacher()) with check (is_teacher());

-- The week (term, number) a class meets an item in, or no row when the class
-- does not take the course.
create or replace function public.class_item_week(p_class uuid, p_course uuid, p_ordinal integer)
returns table (term_id integer, week_number integer)
language sql stable security definer set search_path = public as $$
  select cc.term_id,
         coalesce(i.week_number, greatest(p_ordinal, 1))
  from class_courses cc
  left join class_course_items i
    on i.class_id = cc.class_id and i.course_id = cc.course_id
   and i.ordinal = greatest(p_ordinal, 1)
  where cc.class_id = p_class and cc.course_id = p_course
$$;
revoke execute on function public.class_item_week(uuid, uuid, integer) from public, anon;
grant execute on function public.class_item_week(uuid, uuid, integer) to authenticated, service_role;

create or replace function public.class_item_unlock_at(p_class uuid, p_course uuid, p_ordinal integer)
returns timestamptz language sql stable security definer set search_path = public as $$
  select coalesce(
    (select w.unlock_at from weeks w where w.term_id = iw.term_id and w.number = iw.week_number),
    (select max(w.unlock_at) + (iw.week_number - max(w.number)) * interval '7 days'
       from weeks w where w.term_id = iw.term_id)
  )
  from class_item_week(p_class, p_course, p_ordinal) iw
$$;

create or replace function public.class_item_due_at(p_class uuid, p_course uuid, p_ordinal integer)
returns timestamptz language sql stable security definer set search_path = public as $$
  select coalesce(
    (select w.due_at from weeks w where w.term_id = iw.term_id and w.number = iw.week_number),
    (select max(w.due_at) + (iw.week_number - max(w.number)) * interval '7 days'
       from weeks w where w.term_id = iw.term_id)
  )
  from class_item_week(p_class, p_course, p_ordinal) iw
$$;

update class_courses cc
set term_id = 1, position = 3
from classes c, courses co
where cc.class_id = c.id and cc.course_id = co.id
  and c.name = 'Masjid An-Nabawi' and co.key = 'sifaat_new';
