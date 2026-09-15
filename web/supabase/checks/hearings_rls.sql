-- Live RLS check for teacher hearings. Runs as `authenticated` with a
-- chosen user's claims, and undoes everything at the end. Substitute the
-- two ids, then from the repo root:
--   npx tsx execution/apply_migration.ts --probe web/supabase/checks/hearings_rls.sql
-- Every check raises on failure; success prints one row: "hearings rls ok".
do $$
declare
  teacher uuid := 'TEACHER_UUID';
  student uuid := 'STUDENT_UUID';
  sid uuid;
  n int;
begin
  -- ── as the teacher ──────────────────────────────────────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', teacher, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into revision_sessions (reviewer_id, reciter_id, kind, surah_number)
    values (teacher, student, 'hearing', 114) returning id into sid;
  insert into revision_mistakes (session_id, surah_number, ayah_number, word_position, category, detail)
    values (sid, 114, 1, 1, 'hifz', 'forgot');

  -- a teacher cannot create a PEER session
  begin
    insert into revision_sessions (reviewer_id, reciter_id, kind)
      values (teacher, student, 'peer');
    raise exception 'teacher was allowed to insert a peer session';
  exception when insufficient_privilege or check_violation then null;
  end;

  reset role;

  -- ── as the student, before submit ───────────────────────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', student, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into n from revision_sessions where id = sid;
  if n <> 0 then raise exception 'student saw an unsubmitted hearing'; end if;
  select count(*) into n from revision_mistakes where session_id = sid;
  if n <> 0 then raise exception 'student saw mistakes of an unsubmitted hearing'; end if;

  -- a student cannot create a hearing
  begin
    insert into revision_sessions (reviewer_id, reciter_id, kind, surah_number)
      values (student, teacher, 'hearing', 114);
    raise exception 'student was allowed to insert a hearing';
  exception when insufficient_privilege or check_violation then null;
  end;

  reset role;

  -- ── submit as the teacher, read as the student ──────────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', teacher, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update revision_sessions set submitted_at = now(), outcome = 'not_passed' where id = sid;
  reset role;

  perform set_config('request.jwt.claims',
    json_build_object('sub', student, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from revision_sessions where id = sid;
  if n <> 1 then raise exception 'student cannot see a submitted hearing'; end if;
  select count(*) into n from revision_mistakes where session_id = sid;
  if n <> 1 then raise exception 'student cannot see the mistakes of a submitted hearing'; end if;
  reset role;

  -- ── undo ────────────────────────────────────────────────────────
  delete from revision_sessions where id = sid;   -- mistakes cascade
  raise notice 'hearings rls ok';
end $$;
select 'hearings rls ok' as result;
