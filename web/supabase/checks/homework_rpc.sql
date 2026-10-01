-- Live check for get_homework_for_student after 0039. Read-only: it runs as
-- `authenticated` with one student's claims and writes nothing. Substitute
-- the id (pick a student in a class WITH a syllabus, e.g. group 1, since
-- that is where the list and the page used to disagree), then from the repo
-- root:
--   npx tsx execution/apply_migration.ts --probe web/supabase/checks/homework_rpc.sql
-- Every check raises on failure; success prints one row: "homework rpc ok".
do $$
declare
  student uuid := 'STUDENT_UUID';
  -- Every homework, read BEFORE the role switch: as the student, RLS would
  -- hide exactly the rows this check needs to ask the RPC about.
  every_id uuid[] := (select array_agg(id) from homeworks);
  hw_id uuid;
  listed boolean;
  payload jsonb;
  q jsonb;
  shown int := 0;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', student, 'role', 'authenticated')::text, true);
  set local role authenticated;

  foreach hw_id in array coalesce(every_id, '{}') loop
    -- What the homework list sees (the s_homeworks_unlocked policy) ...
    listed := exists (select 1 from homeworks h where h.id = hw_id);
    -- ... and what opening it returns. They must agree both ways: listed but
    -- null is the 404 0039 fixes, null-listed but returned is the leak.
    payload := get_homework_for_student(hw_id);
    if listed and payload is null then
      raise exception 'homework % is listed but the RPC returns null', hw_id;
    end if;
    if not listed and payload is not null then
      raise exception 'homework % is hidden from the list but the RPC returns it', hw_id;
    end if;

    if payload is not null then
      shown := shown + 1;
      for q in select * from jsonb_array_elements(payload->'questions') loop
        if q ? 'rubric' then
          raise exception 'homework %: a question carries its rubric', hw_id;
        end if;
        if exists (select 1 from jsonb_array_elements(coalesce(q->'options', '[]')) o
                   where o ? 'correct') then
          raise exception 'homework %: an option carries its answer key', hw_id;
        end if;
        if jsonb_typeof(q->'media') = 'object' and exists (
             select 1 from jsonb_object_keys(q->'media') k
             where k not in ('clip', 'option_audio')) then
          raise exception 'homework %: media carries a key beyond clip/option_audio', hw_id;
        end if;
        if jsonb_typeof(q->'media'->'clip') = 'object' and exists (
             select 1 from jsonb_object_keys(q->'media'->'clip') k
             where k not in ('url', 'start_ms', 'end_ms', 'label')) then
          raise exception 'homework %: the clip carries a key beyond its four', hw_id;
        end if;
        if jsonb_typeof(q->'media'->'option_audio') = 'object' and exists (
             select 1 from jsonb_each(q->'media'->'option_audio') e,
                           jsonb_object_keys(e.value) k
             where k not in ('url', 'start_ms', 'end_ms')) then
          raise exception 'homework %: option audio carries a key beyond its three', hw_id;
        end if;
      end loop;
    end if;
  end loop;

  reset role;
  raise notice 'homework rpc ok: % of % homeworks open to this student',
    shown, coalesce(array_length(every_id, 1), 0);
end $$;
select 'homework rpc ok' as result;
