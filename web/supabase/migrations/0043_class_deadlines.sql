-- A homework's deadline is the deadline of the week the CLASS meets it in.
--
-- `homeworks.due_at` is one date per homework, from the week the row is filed
-- under. A class on its own syllabus meets some homework in a different term:
-- Masjid An-Nabawi (group 1) takes Mudūd in Term 1, while its rows sit in
-- Term 3, so its Mudūd homework read as due in March and could never be late.
--
-- So the deadline moves onto the week — `weeks.due_at`, the Sunday 18:00
-- after it opens (week 1 of 2026/27: Monday 5 October 17:00, per 0042) — and
-- a homework's deadline for a student is the due_at of the week their class
-- gets that item in: the term's k-th week, the same rule as
-- `class_item_unlock_at`. A class with no syllabus (the sisters' classes)
-- keeps `homeworks.due_at`, which is its own week's deadline. The app mirrors
-- this in scheduledDueAt (lib/curriculum/tree.ts); the two must agree.
--
-- Two more things the same mismatch broke:
--  · get_homework_for_student gated the paper on the row's own week, so
--    An-Nabawi could see Mudūd's homework listed in Term 1 and not open it
--    until March. It now asks can_see_content, the rule RLS already uses.
--  · Masjid Quba (group 4) takes Mabādi' in Term 3, the same as Masjid
--    Al-Umawi (group 3): settled by the programme lead, 2026-10-02.

alter table weeks add column if not exists due_at timestamptz;

comment on column weeks.due_at is
  'Deadline for homework released in this week: the Sunday 18:00 (London) after unlock_at.';

update weeks
set due_at = case
  when term_id = 1 and number = 1
    then timestamp '2026-10-05 17:00' at time zone 'Europe/London'
  else (((unlock_at at time zone 'Europe/London')::date
         + ((7 - extract(isodow from unlock_at at time zone 'Europe/London')::int) % 7))
        + time '18:00') at time zone 'Europe/London'
end;

create or replace function public.class_item_due_at(p_class uuid, p_course uuid, p_ordinal integer)
returns timestamptz language sql stable security definer set search_path = public as $$
  with term_weeks as (
    select w.due_at, row_number() over (order by w.unlock_at) as k
    from class_courses cc join weeks w on w.term_id = cc.term_id
    where cc.class_id = p_class and cc.course_id = p_course
  )
  select coalesce(
    (select due_at from term_weeks where k = greatest(p_ordinal, 1)),
    (select max(due_at) + (greatest(p_ordinal, 1) - max(k)) * interval '7 days' from term_weeks)
  )
$$;
revoke execute on function public.class_item_due_at(uuid, uuid, integer) from public, anon;
grant execute on function public.class_item_due_at(uuid, uuid, integer) to authenticated, service_role;

-- This student's deadline for this homework.
create or replace function public.homework_due_for(p_hw uuid, p_student uuid)
returns timestamptz language sql stable security definer set search_path = public as $$
  select coalesce(
    (select class_item_due_at(p.class_id, h.course_id, h.ordinal)
       from profiles p
      where p.id = p_student
        and exists (select 1 from class_courses cc where cc.class_id = p.class_id)),
    h.due_at)
  from homeworks h where h.id = p_hw
$$;
revoke execute on function public.homework_due_for(uuid, uuid) from public, anon;
grant execute on function public.homework_due_for(uuid, uuid) to authenticated, service_role;

-- the hand-in stamps lateness against the student's own deadline
create or replace function public.guard_student_submission()
returns trigger language plpgsql set search_path = public as $$
declare
  due timestamptz;
begin
  if not public.is_student_write() then return new; end if;

  if tg_op = 'INSERT' then
    new.status := 'draft';
    new.is_late := false;
    new.submitted_at := null;
    new.approved_by := null;
    new.approved_at := null;
    new.imported_marks := null;
    new.attempt := 1;
    new.previous_pct := null;
    return new;
  end if;

  new.homework_id := old.homework_id;
  new.student_id := old.student_id;
  new.approved_by := old.approved_by;
  new.approved_at := old.approved_at;
  new.imported_marks := old.imported_marks;
  new.attempt := old.attempt;
  new.previous_pct := old.previous_pct;

  if old.status = 'draft' and new.status = 'submitted' then
    due := public.homework_due_for(old.homework_id, old.student_id);
    new.submitted_at := now();
    new.is_late := due is not null and now() > due;
  else
    -- any other move (back to draft, or a racing upsert) leaves it as it was
    new.status := old.status;
    new.submitted_at := old.submitted_at;
    new.is_late := old.is_late;
  end if;
  return new;
end $$;

drop function if exists public.homework_due_at(uuid);

-- the paper: visible by the class's schedule, with the class's deadline
create or replace function public.get_homework_for_student(hw_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case
    when not exists (
      select 1 from homeworks h
      where h.id = hw_id
        and (sees_all_content() or can_see_content(h.course_id, h.ordinal, h.week_id))
    ) then null
    else (
      select jsonb_build_object(
        'homework', jsonb_build_object(
          'id', h.id, 'number', h.number, 'title', h.title,
          'series', h.series, 'total_marks', h.total_marks,
          'due_at', homework_due_for(h.id, auth.uid()), 'is_graded', h.is_graded
        ),
        'questions', coalesce(jsonb_agg(
          jsonb_build_object(
            'id', q.id, 'position', q.position, 'qtype', q.qtype,
            'prompt', q.prompt, 'points', q.points,
            'is_bonus', q.is_bonus, 'is_task', q.is_task,
            'options', (
              select jsonb_agg(jsonb_build_object(
                'position', o->'position', 'label', o->'label', 'value', o->'value'
              ) order by (o->>'position')::int)
              from jsonb_array_elements(q.options) o
            )
          ) order by q.position
        ) filter (where q.id is not null), '[]'::jsonb)
      )
      from homeworks h
      left join questions q on q.homework_id = h.id
      where h.id = hw_id
      group by h.id
    )
  end
$$;

insert into class_courses (class_id, course_id, term_id, position)
select c.id, co.id, 3, 2
from classes c, courses co
where c.name = 'Masjid Quba' and co.key = 'mabadi'
  and not exists (
    select 1 from class_courses cc where cc.class_id = c.id and cc.course_id = co.id
  );
