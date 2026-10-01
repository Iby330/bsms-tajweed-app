-- Pre-launch hardening, from the 2026-10-01 audit.
--
-- 1. Signed-out visitors read nothing. Supabase's default privileges hand
--    `anon` every right on every new table, view and function in public, and
--    the leaderboard views are not security_invoker — so with only the anon
--    key (which ships in the client bundle) anyone could read every student's
--    name, section and homework %. No page queries the database signed out
--    (/apply writes through the service role), so anon needs nothing here.
-- 2. A student writes their answers and hands in — nothing else. The RLS
--    policies scope rows, not columns, so a student could PATCH final_marks,
--    imported_marks, is_late or submitted_at on their own rows straight
--    through PostgREST. Every grading write in the app goes through the
--    service role or a teacher, so triggers pin those columns for anyone
--    else rather than column grants, which would also bind teachers.
-- 3. A peer reviewer edits their notes, not who or what the session is about,
--    and not after it is submitted.
-- 4. The migration ledger is not writable from the internet.
-- 5. Due dates follow the 2026/27 calendar: 0023/0028 moved the weeks'
--    unlock dates but left due_at on last year's, so every homework would
--    open already overdue.

-- 1 ─ signed-out reads ──────────────────────────────────────────────────────

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon;

-- Functions are executable by PUBLIC unless revoked from it, so revoking
-- from anon alone changes nothing; signed-in users get theirs back by name.
revoke execute on function public.can_see_content(uuid, integer, uuid) from public, anon;
revoke execute on function public.class_item_unlock_at(uuid, uuid, integer) from public, anon;
revoke execute on function public.get_homework_for_student(uuid) from public, anon;
revoke execute on function public.is_teacher() from public, anon;
revoke execute on function public.sees_all_content() from public, anon;
revoke execute on function public.voice_note_submission(text) from public, anon;
revoke execute on function public.voice_note_writable(text) from public, anon;
grant execute on function public.can_see_content(uuid, integer, uuid) to authenticated, service_role;
grant execute on function public.class_item_unlock_at(uuid, uuid, integer) to authenticated, service_role;
grant execute on function public.get_homework_for_student(uuid) to authenticated, service_role;
grant execute on function public.is_teacher() to authenticated, service_role;
grant execute on function public.sees_all_content() to authenticated, service_role;
grant execute on function public.voice_note_submission(text) to authenticated, service_role;
grant execute on function public.voice_note_writable(text) to authenticated, service_role;

alter function public.voice_note_submission(text) set search_path = public;
alter function public.voice_note_writable(text) set search_path = public;

-- TRUNCATE ignores RLS; nobody signed in has a reason to hold it.
revoke truncate, trigger, references on all tables in schema public from authenticated;

-- 2 ─ grading columns ───────────────────────────────────────────────────────

-- Who the guards apply to: a signed-in non-teacher talking to PostgREST.
-- The service role and SECURITY DEFINER functions (open_homework_redo) run
-- as other roles and pass straight through.
create or replace function public.is_student_write()
returns boolean language sql stable set search_path = public as $$
  select current_user = 'authenticated' and not public.is_teacher()
$$;

-- Students cannot read questions (they hold the answer keys), so the
-- paper check needs definer rights.
create or replace function public.answer_on_paper(sub_id uuid, q_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from submissions s join questions q on q.homework_id = s.homework_id
    where s.id = sub_id and q.id = q_id
  )
$$;
revoke execute on function public.answer_on_paper(uuid, uuid) from public, anon;
grant execute on function public.answer_on_paper(uuid, uuid) to authenticated, service_role;

create or replace function public.guard_student_answer()
returns trigger language plpgsql set search_path = public as $$
begin
  if not public.is_student_write() then return new; end if;

  if tg_op = 'INSERT' then
    if not public.answer_on_paper(new.submission_id, new.question_id) then
      raise exception 'That question is not on this homework.' using errcode = '42501';
    end if;
    new.auto_marks := null;
    new.auto_rubric := null;
    new.final_marks := null;
    new.teacher_comment := null;
  else
    new.submission_id := old.submission_id;
    new.question_id := old.question_id;
    new.auto_marks := old.auto_marks;
    new.auto_rubric := old.auto_rubric;
    new.final_marks := old.final_marks;
    new.teacher_comment := old.teacher_comment;
  end if;
  return new;
end $$;

drop trigger if exists guard_student_answer on answers;
create trigger guard_student_answer before insert or update on answers
  for each row execute function public.guard_student_answer();

-- The hand-in is the one change of state a student makes, and the server
-- stamps it: when it happened and whether that was after the deadline.
create or replace function public.homework_due_at(hw_id uuid)
returns timestamptz language sql stable security definer set search_path = public as $$
  select due_at from homeworks where id = hw_id
$$;
revoke execute on function public.homework_due_at(uuid) from public, anon;
grant execute on function public.homework_due_at(uuid) to authenticated, service_role;

create or replace function public.guard_student_submission()
returns trigger language plpgsql set search_path = public as $$
declare
  due timestamptz;
begin
  if not public.is_student_write() then return new; end if;

  if tg_op = 'INSERT' then
    new.status := 'draft';
    new.is_late := false;
    new.submitted_at := null;
    new.approved_by := null;
    new.approved_at := null;
    new.imported_marks := null;
    new.attempt := 1;
    new.previous_pct := null;
    return new;
  end if;

  new.homework_id := old.homework_id;
  new.student_id := old.student_id;
  new.approved_by := old.approved_by;
  new.approved_at := old.approved_at;
  new.imported_marks := old.imported_marks;
  new.attempt := old.attempt;
  new.previous_pct := old.previous_pct;

  if old.status = 'draft' and new.status = 'submitted' then
    due := public.homework_due_at(old.homework_id);
    new.submitted_at := now();
    new.is_late := due is not null and now() > due;
  else
    -- any other move (back to draft, or a racing upsert) leaves it as it was
    new.status := old.status;
    new.submitted_at := old.submitted_at;
    new.is_late := old.is_late;
  end if;
  return new;
end $$;

drop trigger if exists guard_student_submission on submissions;
create trigger guard_student_submission before insert or update on submissions
  for each row execute function public.guard_student_submission();

-- 3 ─ peer review sessions ──────────────────────────────────────────────────

create or replace function public.guard_student_session()
returns trigger language plpgsql set search_path = public as $$
begin
  if not public.is_student_write() then return new; end if;

  if old.submitted_at is not null then
    raise exception 'This session has already been submitted.' using errcode = '42501';
  end if;
  new.reciter_id := old.reciter_id;
  new.reviewer_id := old.reviewer_id;
  new.kind := old.kind;
  new.surah_number := old.surah_number;
  new.to_surah_number := old.to_surah_number;
  new.started_at := old.started_at;
  return new;
end $$;

drop trigger if exists guard_student_session on revision_sessions;
create trigger guard_student_session before update on revision_sessions
  for each row execute function public.guard_student_session();

-- 4 ─ the ledger ────────────────────────────────────────────────────────────

alter table public.schema_migrations enable row level security;
revoke all on public.schema_migrations from anon, authenticated;

-- 5 ─ due dates ─────────────────────────────────────────────────────────────

-- Sunday 18:00 UK time at the end of the week the homework unlocks in,
-- the rule last year's dates followed (written in London time, so it holds
-- across the clock change).
update homeworks h
set due_at = (((w.unlock_at at time zone 'Europe/London')::date + 6) + time '18:00')
             at time zone 'Europe/London'
from weeks w
where w.id = h.week_id;

-- teacher views join answers to questions; nothing indexed that side
create index if not exists answers_question_id_idx on answers (question_id);
