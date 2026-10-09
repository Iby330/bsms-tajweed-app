-- A Resources course's homework is open to the class, with no deadline.
--
-- Masjid An-Nabawi's teacher sets Umm al-Kitab work in person: one student is
-- told to watch a video, another to watch it and do its homework (programme
-- lead, 9 October). So for a course a class has in Resources (0075) and not
-- in its plan, the homework is listed and openable whenever they like, and it
-- has no deadline: homework_due_for answers null (a teacher's extension still
-- wins), which the hand-in stamp reads as never late. The app keeps these off
-- Home's "due" and "overdue" lists; the Resources page links each one under
-- its video.

-- Is this course in Resources for the reader's class?
create or replace function public.is_resource_course(p_course uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from class_resources r join profiles p on p.class_id = r.class_id
     where p.id = auth.uid() and r.course_id = p_course
  )
$$;
revoke execute on function public.is_resource_course(uuid) from public, anon;
grant execute on function public.is_resource_course(uuid) to authenticated, service_role;

-- The same for a named student, and only when the course is NOT also in their
-- plan: a course a class takes keeps its deadlines.
create or replace function public.resource_only_for(p_student uuid, p_course uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from class_resources r join profiles p on p.class_id = r.class_id
     where p.id = p_student and r.course_id = p_course
       and not exists (select 1 from class_courses cc where cc.class_id = p.class_id and cc.course_id = p_course)
  )
$$;
revoke execute on function public.resource_only_for(uuid, uuid) from public, anon;
grant execute on function public.resource_only_for(uuid, uuid) to authenticated, service_role;

drop policy if exists s_homeworks_unlocked on homeworks;
create policy s_homeworks_unlocked on homeworks for select using (
  (sees_all_content() or can_see_content(course_id, ordinal, week_id) or is_resource_course(course_id))
  and not homework_held(course_id)
);

-- The paper RPC's gate, the same predicate.
do $$
declare
  def text := pg_get_functiondef('public.get_homework_for_student(uuid)'::regprocedure);
  gate constant text := 'and (sees_all_content() or can_see_content(h.course_id, h.ordinal, h.week_id))';
begin
  if position('is_resource_course' in def) > 0 then return; end if;
  if (length(def) - length(replace(def, gate, ''))) / length(gate) <> 1 then
    raise exception 'get_homework_for_student gate is not the one this migration expects';
  end if;
  execute replace(def, gate,
    'and (sees_all_content() or can_see_content(h.course_id, h.ordinal, h.week_id) or is_resource_course(h.course_id))');
end $$;

-- 0067's deadline, with Resources-only homework answering null.
create or replace function public.homework_due_for(p_hw uuid, p_student uuid)
returns timestamptz language sql stable security definer set search_path = public as $$
  select coalesce(
    (select e.due_at from homework_extensions e
      where e.homework_id = p_hw and e.student_id = p_student),
    case when resource_only_for(p_student, h.course_id) then null else coalesce(
      (select class_item_due_at(p.class_id, h.course_id, h.ordinal)
         from profiles p
        where p.id = p_student
          and exists (select 1 from class_courses cc where cc.class_id = p.class_id)),
      (select sw.due_at from section_weeks sw join profiles p on p.section = sw.section
        where p.id = p_student and sw.week_id = h.week_id),
      h.due_at) end)
  from homeworks h where h.id = p_hw
$$;
