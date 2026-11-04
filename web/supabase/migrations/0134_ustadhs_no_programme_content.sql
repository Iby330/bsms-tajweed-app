-- A class with no syllabus falls back to the programme's whole calendar, which
-- is how the sisters ran before theirs was set. The ustadhs are not on that
-- calendar: their class showed twelve overdue homeworks on its first day. No
-- syllabus now means no programme content for this section. Resources keep
-- their own permission (class_resources) and are unaffected.
create or replace function public.can_see_content(p_course uuid, p_ordinal integer, p_week uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with me as (select class_id, section from profiles where id = public.acting_id())
  select case
    when exists (select 1 from class_courses cc, me where cc.class_id = me.class_id)
      then coalesce(
        (select class_item_unlock_at(me.class_id, p_course, greatest(coalesce(p_ordinal, 1), 1)) <= now()
                and not class_item_held(me.class_id, p_course, greatest(coalesce(p_ordinal, 1), 1))
           from me),
        false)
    when (select section from me) = 'ustadhs' then false
    else exists (
      select 1 from weeks w
      left join section_weeks sw on sw.week_id = w.id and sw.section = (select section from me)
      where w.id = p_week and coalesce(sw.unlock_at, w.unlock_at) <= now())
  end;
$function$;
