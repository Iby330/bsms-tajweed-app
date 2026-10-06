-- A class can take a course and not have its homework yet.
--
-- Hareer (Sajeda) is a basics class taking Qāʿidah in Term 1, but the
-- programme lead does not want them doing its homework yet, while Al-Aqsa
-- does (HW 301, 0063). 0065 took Qāʿidah off Hareer's plan to keep HW 301 from
-- them, which took the course with it; this puts the course back and holds
-- only its homework.
--
-- `class_homework_holds` names a (class, course) whose homework is withheld.
-- The student homework policy and the paper RPC both refuse a held course's
-- homework, so it is neither listed nor openable; lessons are untouched.
-- Teachers still see it. To release, delete the row.

create table if not exists class_homework_holds (
  class_id uuid not null references classes(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  primary key (class_id, course_id)
);
comment on table class_homework_holds is
  'A course whose homework this class does not get yet; lessons are unaffected.';
alter table class_homework_holds enable row level security;
revoke all on class_homework_holds from anon;
drop policy if exists t_class_homework_holds on class_homework_holds;
create policy t_class_homework_holds on class_homework_holds
  for all using (is_teacher()) with check (is_teacher());

-- Is this course's homework held for the reader's class?
create or replace function public.homework_held(p_course uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from class_homework_holds h join profiles p on p.class_id = h.class_id
    where p.id = auth.uid() and h.course_id = p_course
  )
$$;
revoke execute on function public.homework_held(uuid) from public, anon;
grant execute on function public.homework_held(uuid) to authenticated, service_role;

drop policy if exists s_homeworks_unlocked on homeworks;
create policy s_homeworks_unlocked on homeworks for select using (
  (sees_all_content() or can_see_content(course_id, ordinal, week_id))
  and not homework_held(course_id)
);

-- The paper RPC's gate, the same predicate plus the hold.
do $$
declare
  def text := pg_get_functiondef('public.get_homework_for_student(uuid)'::regprocedure);
  gate constant text := 'and (sees_all_content() or can_see_content(h.course_id, h.ordinal, h.week_id))';
begin
  if position('homework_held' in def) > 0 then return; end if;
  if (length(def) - length(replace(def, gate, ''))) / length(gate) <> 1 then
    raise exception 'get_homework_for_student gate is not the one this migration expects';
  end if;
  execute replace(def, gate, gate || E'\n        and not homework_held(h.course_id)');
end $$;

insert into class_courses (class_id, course_id, term_id, position)
select c.id, co.id, 1, 1 from classes c, courses co
where c.name = 'Hareer' and co.key = 'qaidah'
on conflict (class_id, course_id) do update set term_id = 1, position = 1;

insert into class_homework_holds (class_id, course_id)
select c.id, co.id from classes c, courses co
where c.name = 'Hareer' and co.key = 'qaidah'
on conflict do nothing;
