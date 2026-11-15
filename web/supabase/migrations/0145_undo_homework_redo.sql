-- ═══════════════════════════════════════════════════════════════════════
-- A teacher can take back a redo: the fail that sent the paper back was the
-- teacher's own slip, not the student's.
--
-- A release below 60% sends the paper back the moment it is approved
-- (0030, 0100): `open_homework_redo` snapshots the attempt, clears its
-- answers and voice notes, and reopens the row as a blank draft. When the
-- fail was the teacher's (marks never given on a hand-marked question, a
-- slipped digit) there was no way back short of SQL by hand. This is that
-- way back, while the student has not yet started the redo.
--
-- It is `open_homework_redo` run backwards, in one transaction: the
-- snapshot's answers and voice notes go back into the live tables, the row
-- returns to the attempt it was, and the snapshot is deleted. Deleting it
-- is what takes the 60% cap away (`v_hw_pct_all` reads the cap off the
-- snapshots, 0099-0101); older snapshots, from fails before this one, stay
-- and keep whatever cap they impose.
--
-- The paper comes back as `auto_marked`, not `approved`: in the teacher's
-- marking queue, with the marks the teacher gave still on it, so they
-- correct the slip and release it again. The student sees it as handed in
-- and waiting, not as a released fail. Opening it does not mark it again
-- (only `submitted` sends a paper to the model), and releasing it emails the
-- student the corrected result, as any first release does.
--
-- `create or replace`, so the file can be run again.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function undo_homework_redo(sub_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  s    record;
  snap record;
  older_pct numeric;
begin
  -- `for update`, as in open_homework_redo: two teachers pressing undo at
  -- once must not both restore the same snapshot.
  select * into s from submissions where id = sub_id for update;

  -- `found` rather than `s.id is null`: a record variable that no row was
  -- read into is unassigned, and touching a field of it raises instead.
  if not found then
    raise exception 'Submission % not found', sub_id;
  end if;

  -- Only a redo still being written can be taken back. A redo that has been
  -- handed in is the student's new work, and a first attempt has nothing
  -- behind it to restore.
  if s.status <> 'draft' or s.attempt <= 1 then
    raise exception 'Submission % is not a redo waiting to be written', sub_id;
  end if;

  select * into snap
    from submission_attempts
   where submission_id = s.id
     and attempt = s.attempt - 1
     for update;

  if not found then
    raise exception 'Submission % has no earlier attempt to bring back', sub_id;
  end if;

  -- Any answer or recording on the draft means the student has started the
  -- redo, and putting the old paper back would overwrite their new work.
  -- A blank redo holds no rows at all: the student's form writes an answer
  -- only when one is typed or picked (saveAnswer) and a recording only when
  -- one is made (saveVoiceNote), never a placeholder on opening the paper.
  -- Deleting a recording removes both of its rows, so a student who recorded
  -- and then deleted it counts as not started, which is true of the paper.
  -- The message is matched in the app (lib/marking/redo.ts) to tell the
  -- teacher in plain words, so keep the phrase "already started the redo".
  if exists (select 1 from answers     where submission_id = s.id)
     or exists (select 1 from voice_notes where submission_id = s.id) then
    raise exception 'Submission %: the student has already started the redo', sub_id;
  end if;

  -- The answers as they were, marks and comments included. `->>` gives SQL
  -- null for a JSON null, but `->` gives the jsonb value `null`, which would
  -- land in auto_rubric as a JSON null rather than no rubric at all; hence
  -- the nullif. `response` is NOT NULL and was copied from a NOT NULL column,
  -- so it goes back exactly as it was.
  -- An answer whose question has since been deleted is left in the snapshot's
  -- past rather than failing the foreign key and the whole undo with it.
  insert into answers (
    submission_id, question_id, response,
    auto_marks, auto_rubric, final_marks, teacher_comment
  )
  select s.id,
         (x->>'question_id')::uuid,
         x->'response',
         (x->>'auto_marks')::numeric,
         nullif(x->'auto_rubric', 'null'::jsonb),
         (x->>'final_marks')::numeric,
         x->>'teacher_comment'
    from jsonb_array_elements(snap.answers) as x
   where exists (select 1 from questions q where q.id = (x->>'question_id')::uuid);

  -- The recordings. The files were never deleted from storage, and their
  -- paths name the attempt they were made on, which is the attempt the row
  -- returns to below, so they play again as they did.
  insert into voice_notes (submission_id, question_id, storage_path, duration_s)
  select s.id,
         (v->>'question_id')::uuid,
         v->>'storage_path',
         (v->>'duration_s')::int
    from jsonb_array_elements(snap.voice_notes) as v
   where exists (select 1 from questions q where q.id = (v->>'question_id')::uuid);

  -- What the student is told they scored last time, if this was already a
  -- redo before the one being taken back: the attempt before the restored one.
  select pct into older_pct
    from submission_attempts
   where submission_id = s.id
     and attempt = snap.attempt - 1;

  -- Handed in when it was, late if it was; not released, so no approver.
  update submissions
     set status       = 'auto_marked',
         attempt      = snap.attempt,
         previous_pct = older_pct,
         submitted_at = snap.submitted_at,
         is_late      = snap.is_late,
         approved_by  = null,
         approved_at  = null
   where id = s.id;

  -- Last: the attempt is live again, so it is no longer a superseded one,
  -- and the cap its fail imposed goes with it.
  delete from submission_attempts where id = snap.id;

  return snap.attempt;
end $$;

-- As with open_homework_redo: only the service-role client may call this,
-- never a signed-in student, and never a teacher's own session directly.
revoke execute on function undo_homework_redo(uuid) from public, anon, authenticated;
