-- Salsabeel (Sajeda) gets Qāʿidah homework 1, due Tuesday 13 October 18:00.
--
-- 0068 held Salsabeel's Qāʿidah homework. The programme lead (12 October)
-- releases week 1 (HW 301) only, due tomorrow at 18:00 UK time; HW 302 and
-- the rest stay held. A hold covered a whole course, so it gains
-- `from_ordinal`: the hold applies to the course's homework from that ordinal
-- on (1 = all of it, as before). To release the next paper, raise it; to
-- release the rest, delete the row.
--
-- The deadline: Salsabeel's Qāʿidah item 1 is met in week 2 of Term 1
-- (class_course_items), whose sisters' deadline is Tuesday 13 October 18:00
-- (section_weeks, 0070). It opened 9 October, so lesson 1 stays visible.
-- HW 301's deadline for Al-Aqsa is untouched.
--
-- Every statement idempotent so a half-applied batch can be re-run.

alter table class_homework_holds
  add column if not exists from_ordinal integer not null default 1
  check (from_ordinal >= 1);
comment on column class_homework_holds.from_ordinal is
  'The hold covers the course''s homework from this ordinal on; 1 = all of it.';

-- Is this homework held for the reader's class?
create or replace function public.homework_held(p_course uuid, p_ordinal integer)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from class_homework_holds h join profiles p on p.class_id = h.class_id
    where p.id = auth.uid() and h.course_id = p_course
      and greatest(coalesce(p_ordinal, 1), 1) >= h.from_ordinal
  )
$$;
revoke execute on function public.homework_held(uuid, integer) from public, anon;
grant execute on function public.homework_held(uuid, integer) to authenticated, service_role;

drop policy if exists s_homeworks_unlocked on homeworks;
create policy s_homeworks_unlocked on homeworks for select using (
  (sees_all_content() or can_see_content(course_id, ordinal, week_id) or is_resource_course(course_id))
  and not homework_held(course_id, ordinal)
);

-- The paper RPC's hold check, by ordinal too.
do $$
declare
  def text := pg_get_functiondef('public.get_homework_for_student(uuid)'::regprocedure);
  old_check constant text := 'homework_held(h.course_id)';
begin
  if position('homework_held(h.course_id, h.ordinal)' in def) > 0 then return; end if;
  if (length(def) - length(replace(def, old_check, ''))) / length(old_check) <> 1 then
    raise exception 'get_homework_for_student hold check is not the one this migration expects';
  end if;
  execute replace(def, old_check, 'homework_held(h.course_id, h.ordinal)');
end $$;

-- Nothing reads the course-only form now.
drop function if exists public.homework_held(uuid);

update class_homework_holds hh set from_ordinal = 2
  from classes c, courses co
 where hh.class_id = c.id and hh.course_id = co.id
   and c.name = 'Salsabeel' and co.key = 'qaidah';

insert into class_course_items (class_id, course_id, ordinal, week_number)
select c.id, co.id, 1, 2 from classes c, courses co
where c.name = 'Salsabeel' and co.key = 'qaidah'
on conflict (class_id, course_id, ordinal) do update set week_number = 2;

select h.number, hh.from_ordinal,
       class_item_unlock_at(c.id, h.course_id, h.ordinal) as unlock_at,
       class_item_due_at(c.id, h.course_id, h.ordinal) as due_at
  from homeworks h
  join courses co on co.id = h.course_id and co.key = 'qaidah'
  join classes c on c.name = 'Salsabeel'
  join class_homework_holds hh on hh.class_id = c.id and hh.course_id = co.id
 order by h.ordinal;
