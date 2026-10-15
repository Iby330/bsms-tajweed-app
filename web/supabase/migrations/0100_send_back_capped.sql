-- ═══════════════════════════════════════════════════════════════════════
-- A teacher's send-back can be capped at 60% when the teacher says so.
--
-- 0099 left the cap to a fail alone: an attempt released below 60% caps
-- every attempt after it. A teacher now has two buttons on any handed-in
-- paper, marked or not: "Reopen", which gives it back with its answers on
-- the same attempt (handed in too early, a question left blank) and so is
-- never capped, and "Send back (capped at 60%)", a blank redo that counts as
-- 60% at most, as a fail's redo does.
--
-- (Applied live, then the capped button was dropped before it shipped: no
-- caller passes `capped`, so it is false on every row. The column, the
-- function's wider status check and the view stay as applied; 0101 builds
-- on the view.)
--
-- That send-back may now come before the paper is marked, so the function
-- takes a handed-in paper of any status but draft, not only an approved one.
-- An unmarked paper is snapshotted with a null pct (there is no released
-- mark to quote) and no approver.
--
-- The choice is kept on the attempt it supersedes, beside the pct it was
-- sent back from, so the view reads both off the same snapshot row:
-- `sa.pct < 60 or sa.capped`. Every attempt already sent back is false, which
-- is what 0099 made of them.
--
-- The function gains a third argument with a default, so the app's current
-- two-argument call keeps working until the new code is deployed. The old
-- signature is dropped first: alongside the new one, a two-argument call
-- would match both and fail as ambiguous.
-- ═══════════════════════════════════════════════════════════════════════

alter table submission_attempts
  add column if not exists capped boolean not null default false;

drop function if exists open_homework_redo(uuid, numeric);

create or replace function open_homework_redo(
  sub_id uuid,
  failed_pct numeric,
  capped boolean default false
)
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

  -- A redo follows a hand-in: a release (the automatic one, or the teacher's
  -- after it) or the teacher's own send-back of a paper not yet marked. A
  -- draft is a caller bug and should fail loudly rather than blank a paper
  -- the student is writing.
  if s.status = 'draft' then
    raise exception 'Submission % has not been handed in', sub_id;
  end if;

  insert into submission_attempts (
    submission_id, homework_id, student_id, attempt, pct, capped,
    is_late, submitted_at, approved_by, approved_at, answers, voice_notes
  )
  values (
    s.id, s.homework_id, s.student_id, s.attempt, failed_pct,
    open_homework_redo.capped,
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
revoke execute on function open_homework_redo(uuid, numeric, boolean) from public, anon, authenticated;

-- 0099 with the teacher's cap added to the fail. Same columns, same order.
create or replace view v_hw_pct_all as
  select student_id,
         homework_id,
         number,
         term_id,
         case when capped_before and pct > 60 then 60 else pct end as pct
    from (
      select s.student_id,
             h.id       as homework_id,
             h.number,
             w.term_id,
             exists (
               select 1 from submission_attempts sa
                where sa.submission_id = s.id and (sa.pct < 60 or sa.capped)
             ) as capped_before,
             (coalesce(
                sum(a.final_marks) filter (where not q.is_bonus),
                s.imported_marks
              ) / h.total_marks) * 100 as pct
        from submissions s
        join homeworks h on h.id = s.homework_id and h.is_graded
        join weeks     w on w.id = h.week_id
        left join answers   a on a.submission_id = s.id
        left join questions q on q.id = a.question_id
       where s.status = 'approved'
       group by s.student_id, s.id, h.id, h.number, w.term_id, h.total_marks,
                s.imported_marks
    ) raw;
