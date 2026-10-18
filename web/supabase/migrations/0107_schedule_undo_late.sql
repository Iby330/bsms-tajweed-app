-- Undo for a schedule change has to put back the late marks the change
-- cleared (0106's clear_late_for_class only counted them). These two return
-- and restore exactly the hand-ins concerned, nothing else.
--
-- Every statement idempotent.

-- Clears "late" on a class's hand-ins now on time, and says which ones.
create or replace function public.clear_late_for_class_ids(p_class uuid)
returns uuid[] language plpgsql security definer set search_path = public as $$
declare ids uuid[];
begin
  with cleared as (
    update submissions s set is_late = false
      from profiles p
     where p.id = s.student_id and p.class_id = p_class
       and s.is_late and s.submitted_at is not null
       and s.submitted_at <= homework_due_for(s.homework_id, s.student_id)
    returning s.id
  )
  select coalesce(array_agg(id), '{}') into ids from cleared;
  return ids;
end $$;

-- Puts the late mark back on those hand-ins (Undo), for that class only.
create or replace function public.restore_late(p_class uuid, p_ids uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update submissions s set is_late = true
    from profiles p
   where s.id = any(p_ids) and p.id = s.student_id and p.class_id = p_class
     and s.submitted_at is not null;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.clear_late_for_class_ids(uuid) from public, anon, authenticated;
revoke execute on function public.restore_late(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.clear_late_for_class_ids(uuid) to service_role;
grant execute on function public.restore_late(uuid, uuid[]) to service_role;
