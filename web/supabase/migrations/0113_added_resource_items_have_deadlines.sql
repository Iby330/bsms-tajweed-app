-- A Resources video or homework a teacher adds to one of the class's weeks
-- (class_added_items, 0108) is that week's work: it is due like any other.
--
-- 0077 made every homework of a Resources course deadline-free for a class
-- that does not take the course. That stays true for the rest of the course;
-- only the items added to the schedule now take their week's deadline
-- (class_item_due_at), so the late stamp agrees with what the student is
-- shown. Masjid An-Nabawi's Umm al-Kitāb is the case that asked for it.
--
-- Idempotent.

create or replace function public.homework_due_for(p_hw uuid, p_student uuid)
returns timestamptz language sql stable security definer set search_path = public as $$
  select coalesce(
    (select e.due_at from homework_extensions e
      where e.homework_id = p_hw and e.student_id = p_student),
    case when resource_only_for(p_student, h.course_id)
              and not exists (
                select 1 from class_added_items a join profiles p on p.class_id = a.class_id
                 where p.id = p_student and a.course_id = h.course_id
                   and a.ordinal = greatest(coalesce(h.ordinal, 1), 1))
      then null else coalesce(
      (select class_item_due_at(p.class_id, h.course_id, h.ordinal)
         from profiles p
        where p.id = p_student
          and exists (select 1 from class_courses cc where cc.class_id = p.class_id)),
      (select sw.due_at from section_weeks sw join profiles p on p.section = sw.section
        where p.id = p_student and sw.week_id = h.week_id),
      h.due_at) end)
  from homeworks h where h.id = p_hw
$$;
