-- Live RLS check for teacher hearings, results and marking sessions
-- (counts_as_result = false, migration 0046). Runs as `authenticated` with a
-- chosen user's claims, and undoes everything at the end. Substitute the
-- two ids, then from the repo root:
--   npx tsx execution/apply_migration.ts --probe web/supabase/checks/hearings_rls.sql
-- Every check raises on failure; success prints one row: "hearings rls ok".
do $$
declare
  teacher uuid := 'TEACHER_UUID';
  student uuid := 'STUDENT_UUID';
  sid uuid;
  mid uuid;
  mk uuid;
  n int;
begin
  -- ── as the teacher ──────────────────────────────────────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', teacher, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into revision_sessions (reviewer_id, reciter_id, kind, surah_number, to_surah_number)
    values (teacher, student, 'hearing', 114, 113) returning id into sid;
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
    insert into revision_sessions (reviewer_id, reciter_id, kind, surah_number, to_surah_number)
      values (student, teacher, 'hearing', 114, 114);
    raise exception 'student was allowed to insert a hearing';
  exception when insufficient_privilege or check_violation then null;
  end;

  reset role;

  -- ── submit as the teacher, read as the student ──────────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', teacher, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update revision_sessions set submitted_at = now() where id = sid;
  reset role;

  perform set_config('request.jwt.claims',
    json_build_object('sub', student, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from revision_sessions where id = sid;
  if n <> 1 then raise exception 'student cannot see a submitted hearing'; end if;
  select count(*) into n from revision_mistakes where session_id = sid;
  if n <> 1 then raise exception 'student cannot see the mistakes of a submitted hearing'; end if;
  reset role;

  -- ── a marking session: submitted from its first mark ────────────
  perform set_config('request.jwt.claims',
    json_build_object('sub', teacher, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into revision_sessions
      (reviewer_id, reciter_id, kind, surah_number, to_surah_number, counts_as_result, submitted_at)
    values (teacher, student, 'hearing', 114, 114, false, now()) returning id into mk;
  insert into revision_mistakes (session_id, surah_number, ayah_number, word_position, category)
    values (mk, 114, 2, 1, 'hifz') returning id into mid;
  -- the teacher can take a mark back from their own marking session
  delete from revision_mistakes where id = mid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'teacher could not remove a mark from their marking session'; end if;
  insert into revision_mistakes (session_id, surah_number, ayah_number, word_position, category)
    values (mk, 114, 2, 1, 'hifz');

  -- …but a submitted result stays closed to new marks
  begin
    insert into revision_mistakes (session_id, surah_number, ayah_number, word_position, category)
      values (sid, 114, 3, 1, 'hifz');
    raise exception 'teacher was allowed to mark a submitted result';
  exception when insufficient_privilege then null;
  end;

  reset role;

  perform set_config('request.jwt.claims',
    json_build_object('sub', student, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from revision_mistakes where session_id = mk;
  if n <> 1 then raise exception 'student cannot see a mark from a marking session'; end if;
  -- the student can neither add to nor take from it
  begin
    insert into revision_mistakes (session_id, surah_number, ayah_number, word_position, category)
      values (mk, 114, 4, 1, 'hifz');
    raise exception 'student was allowed to mark a marking session';
  exception when insufficient_privilege then null;
  end;
  delete from revision_mistakes where session_id = mk;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'student removed a mark from a marking session'; end if;
  reset role;

  -- ── undo ────────────────────────────────────────────────────────
  delete from revision_sessions where id in (sid, mk);   -- mistakes cascade
  raise notice 'hearings rls ok';
end $$;
select 'hearings rls ok' as result;
