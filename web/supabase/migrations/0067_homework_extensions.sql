-- More time on one homework for one student.
--
-- A teacher can give a student a later deadline than their class's: illness,
-- a family matter, a paper reopened after the deadline that was on time the
-- first go. `homework_due_for` reads the extension first, so everything that
-- asks it (the late stamp at hand-in, the student's countdown) moves with
-- it; the app's home and course screens apply the same row in
-- getStudentCurriculum. To withdraw, delete the row.
--
-- Every statement idempotent so a half-applied batch can be re-run.

create table if not exists homework_extensions (
  homework_id uuid not null references homeworks(id) on delete cascade,
  student_id  uuid not null references profiles(id) on delete cascade,
  due_at      timestamptz not null,
  granted_by  uuid references profiles(id) on delete set null,
  granted_at  timestamptz not null default now(),
  primary key (homework_id, student_id)
);
comment on table homework_extensions is
  'A later deadline for one student on one homework; wins over the class and section deadline.';

alter table homework_extensions enable row level security;
revoke all on homework_extensions from anon;

drop policy if exists t_homework_extensions on homework_extensions;
create policy t_homework_extensions on homework_extensions
  for all using (is_teacher()) with check (is_teacher());

-- A student reads their own, so their screens can show the new date.
drop policy if exists s_homework_extensions_read on homework_extensions;
create policy s_homework_extensions_read on homework_extensions
  for select using (student_id = auth.uid());

-- 0052's body, with the extension in front.
create or replace function public.homework_due_for(p_hw uuid, p_student uuid)
returns timestamptz language sql stable security definer set search_path = public as $$
  select coalesce(
    (select e.due_at from homework_extensions e
      where e.homework_id = p_hw and e.student_id = p_student),
    (select class_item_due_at(p.class_id, h.course_id, h.ordinal)
       from profiles p
      where p.id = p_student
        and exists (select 1 from class_courses cc where cc.class_id = p.class_id)),
    (select sw.due_at from section_weeks sw join profiles p on p.section = sw.section
      where p.id = p_student and sw.week_id = h.week_id),
    h.due_at)
  from homeworks h where h.id = p_hw
$$;
