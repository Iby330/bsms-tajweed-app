-- ═══════════════════════════════════════════════════════════════════════
-- Homework redo below 60%: approving a submission under the pass mark
-- sends it back as a blank draft, keeping the old attempt as a snapshot.
-- Spec: docs/superpowers/specs/2026-09-15-homework-redo-design.md
-- Every statement idempotent so a half-applied batch can be re-run.
-- ═══════════════════════════════════════════════════════════════════════

-- There is still exactly ONE live submissions row per (homework, student) —
-- the unique constraint stays — so everything that reads "the student's
-- submission" keeps its shape. What the row gains is which go it is on.
alter table submissions add column if not exists attempt int not null default 1;

-- The percentage of the attempt most recently sent back, so the student can
-- be told what they scored without being shown the marked script. Non-null
-- iff attempt > 1; left nullable because attempt 1 has no predecessor.
alter table submissions add column if not exists previous_pct numeric;

-- ── the superseded attempts ────────────────────────────────────────────
-- A snapshot, not a live row: the answers and voice notes are copied here
-- as jsonb and then deleted from `answers` / `voice_notes`, because the
-- student starts the redo from a blank paper and those tables are what the
-- student reads. homework_id and student_id are copied so the teacher's
-- per-homework screens can find attempts without joining through
-- submissions.
create table if not exists submission_attempts (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  homework_id   uuid not null references homeworks(id),
  student_id    uuid not null references profiles(id),
  attempt       int  not null,
  -- The mark that failed. Nullable only for the same reasons pct is ever
  -- unknown upstream; in practice the trigger always has a number.
  pct           numeric,
  is_late       boolean not null default false,
  submitted_at  timestamptz,
  approved_by   uuid references profiles(id),
  approved_at   timestamptz,
  -- [{question_id, response, auto_marks, auto_rubric, final_marks, teacher_comment}]
  answers       jsonb not null default '[]'::jsonb,
  -- [{question_id, storage_path, duration_s}] — the files themselves are NOT
  -- deleted from storage, so an old recitation stays playable by its path.
  voice_notes   jsonb not null default '[]'::jsonb,
  superseded_at timestamptz not null default now(),
  unique (submission_id, attempt)
);

create index if not exists idx_submission_attempts_homework_student
  on submission_attempts (homework_id, student_id);

-- ── RLS ────────────────────────────────────────────────────────────────
-- Teachers read; students get no policy at all. That absence IS the
-- requirement — withholding the old answers and per-question marks is what
-- makes a redo a redo rather than a second guess at the same paper.
alter table submission_attempts enable row level security;

drop policy if exists t_attempts_read on submission_attempts;
create policy t_attempts_read on submission_attempts for select using (is_teacher());

-- ── sending a submission back ──────────────────────────────────────────
-- One transaction: snapshot, clear, reopen. security definer because the
-- rows being deleted belong to a student whose own policies would never
-- allow it, and the whole thing must be atomic — a half-done redo would
-- leave a draft still carrying its marked answers.
create or replace function open_homework_redo(sub_id uuid, failed_pct numeric)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
begin
  -- `for update` because two teachers approving the same submission at once
  -- must not each snapshot it and double-bump the attempt number.
  select * into s from submissions where id = sub_id for update;

  -- `found` rather than `s.id is null`: a record variable that no row was
  -- read into is unassigned, and touching a field of it raises instead.
  if not found then
    raise exception 'Submission % not found', sub_id;
  end if;

  -- A redo only ever follows a release. Anything else is a caller bug and
  -- should fail loudly rather than blank a paper the student is writing.
  if s.status <> 'approved' then
    raise exception 'Submission % is not approved', sub_id;
  end if;

  insert into submission_attempts (
    submission_id, homework_id, student_id, attempt, pct,
    is_late, submitted_at, approved_by, approved_at, answers, voice_notes
  )
  values (
    s.id, s.homework_id, s.student_id, s.attempt, failed_pct,
    s.is_late, s.submitted_at, s.approved_by, s.approved_at,
    (select coalesce(jsonb_agg(jsonb_build_object(
       'question_id', a.question_id,
       'response', a.response,
       'auto_marks', a.auto_marks,
       'auto_rubric', a.auto_rubric,
       'final_marks', a.final_marks,
       'teacher_comment', a.teacher_comment)), '[]'::jsonb)
     from answers a where a.submission_id = s.id),
    (select coalesce(jsonb_agg(jsonb_build_object(
       'question_id', v.question_id,
       'storage_path', v.storage_path,
       'duration_s', v.duration_s)), '[]'::jsonb)
     from voice_notes v where v.submission_id = s.id)
  )
  -- Re-running the same redo (a retried call, a replayed job) must not
  -- fail on the unique key; the snapshot for that attempt already exists.
  on conflict (submission_id, attempt) do nothing;

  delete from answers     where submission_id = s.id;
  delete from voice_notes where submission_id = s.id;

  -- A redo is never late: the original deadline has passed for everyone
  -- and the student is being asked to write it again, not to catch up.
  update submissions
     set status       = 'draft',
         attempt      = s.attempt + 1,
         previous_pct = failed_pct,
         submitted_at = null,
         approved_by  = null,
         approved_at  = null,
         is_late      = false
   where id = s.id;

  return s.attempt + 1;
end $$;

-- Only the service-role client may send a paper back — never a signed-in
-- student, and never a teacher's own session directly.
revoke execute on function open_homework_redo(uuid, numeric) from public, anon, authenticated;
