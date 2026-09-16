-- ═══════════════════════════════════════════════════════════════════════
-- Voice notes: make the recording a real, marked-as-zero answer, lock the
-- bucket down, and turn the four "send a recording to the group chat"
-- tick-boxes into recording tasks.
-- Plan: docs/superpowers/plans/2026-09-16-voice-notes-repair.md
--
-- Every statement is idempotent: the data sections are guarded so a re-run
-- reports zero rows changed rather than decrementing a total twice.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. bucket limits ───────────────────────────────────────────────────
-- Until now the bucket had no size or type ceiling at all, so a phone could
-- push an arbitrary file of any type into it. 25 MB is roughly 20 minutes of
-- the Opus-in-WebM the recorder produces; Safari sends audio/mp4 instead, so
-- the ceiling is the wildcard rather than a list of container types.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('voice-notes', 'voice-notes', false, 25 * 1024 * 1024, array['audio/*'])
on conflict (id) do update
  set file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public             = excluded.public;

-- ── 2. path helpers ────────────────────────────────────────────────────
-- An object is `<uid>/<submission_id>/a<attempt>/<question_id>.<ext>` since
-- the redo (0030), and `<uid>/<submission_id>/<question_id>.<ext>` on the one
-- legacy row. `storage.foldername` returns the DIRECTORY segments, so [1] is
-- the owner and [2] is the submission on both shapes.
--
-- The cast is regex-guarded rather than written `::uuid` directly because a
-- storage policy is OR'd across every bucket: this predicate is evaluated for
-- avatar uploads too, whose second segment is a filename, and a bare cast
-- would raise `invalid input syntax for type uuid` and fail that upload.
create or replace function public.voice_note_submission(object_name text)
returns uuid
language sql
immutable
strict
as $$
  select case
    when (storage.foldername(object_name))[2]
         ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then ((storage.foldername(object_name))[2])::uuid
  end
$$;

-- Writable = your own folder AND the submission it names is still a draft of
-- yours. Once the paper is handed in the recording is part of it, matching
-- how `answers` and `voice_notes` rows already behave.
--
-- Not security definer: the `exists` runs under the caller's RLS, and
-- `s_sub_read` already lets a student see their own submissions.
create or replace function public.voice_note_writable(object_name text)
returns boolean
language sql
stable
as $$
  select (storage.foldername(object_name))[1] = (select auth.uid())::text
     and exists (
       select 1
         from public.submissions s
        where s.id = public.voice_note_submission(object_name)
          and s.student_id = (select auth.uid())
          and s.status = 'draft'
     )
$$;

-- ── 3. storage write policies ──────────────────────────────────────────
-- Replaces the own-folder-only policies from 0001/0007, which let a student
-- overwrite a recitation after hand-in. The read policy (vn_student_read) is
-- deliberately left alone: a student and their teacher may always listen back.
drop policy if exists vn_student_insert on storage.objects;
create policy vn_student_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'voice-notes' and public.voice_note_writable(name));

drop policy if exists vn_student_update on storage.objects;
create policy vn_student_update on storage.objects for update to authenticated
  using      (bucket_id = 'voice-notes' and public.voice_note_writable(name))
  with check (bucket_id = 'voice-notes' and public.voice_note_writable(name));

drop policy if exists vn_student_delete on storage.objects;
create policy vn_student_delete on storage.objects for delete to authenticated
  using (bucket_id = 'voice-notes' and public.voice_note_writable(name));

-- ── 4. discarding a recording removes its answer row ───────────────────
-- `answers` had insert and update policies but no delete, so `deleteVoiceNote`
-- could never clear the `{"voice": …}` row it now writes. Draft-only, exactly
-- mirroring s_ans_insert.
drop policy if exists s_ans_delete on answers;
create policy s_ans_delete on answers for delete using (
  exists (select 1 from submissions s where s.id = submission_id
          and s.student_id = auth.uid() and s.status = 'draft')
);

-- ── 5. backfill: every recording gets an answer row ────────────────────
-- The teacher's comment needs a row to live on. `{"voice": "<storage_path>"}`
-- is the fourth response shape; auto_marks 0 because a task is never marked.
with ins as (
  insert into answers (submission_id, question_id, response, auto_marks)
  select v.submission_id,
         v.question_id,
         jsonb_build_object('voice', v.storage_path),
         0
    from voice_notes v
   where not exists (
     select 1 from answers a
      where a.submission_id = v.submission_id
        and a.question_id   = v.question_id
   )
  on conflict (submission_id, question_id) do nothing
  returning id
)
select count(*) as answers_backfilled from ins;

-- ── 6. the four tick-box tasks become recording tasks ──────────────────
-- (homework number, position) = (6,10), (7,17), (8,9), (17,7); ids probed
-- from the live DB, because a prompt match would drift. Each was a 1-mark
-- mcq whose "answer" was ticking a box to say you had sent a recording to
-- the group chat, so the homework loses that mark and the answers already
-- given for it are zeroed.
--
-- `targets` is evaluated against the statement's snapshot before any of the
-- data-modifying CTEs run, and it is empty once is_task is already true —
-- that is what makes the total_marks decrement a no-op on a re-run.
with targets as (
  select q.id, q.homework_id
    from questions q
   where q.id in (
           'ef52a458-3c54-4d83-b84f-965cbb635aba',  -- hw 6  · q10
           'ef1ed6df-946b-4b6d-9db1-86dcffe52a54',  -- hw 7  · q17
           '3f3df141-3f85-42e6-b1d8-9350275dc082',  -- hw 8  · q9
           '8a50f02a-c96a-44ed-9158-bcdd86e09720'   -- hw 17 · q7
         )
     and q.is_task = false
),
converted as (
  update questions q
     set is_task  = true,
         qtype    = 'text'::qtype_t,
         scoring  = 'manual'::scoring_t,
         options  = null,
         points   = 0
    from targets t
   where q.id = t.id
  returning q.id
),
retotalled as (
  update homeworks h
     set total_marks = h.total_marks - 1
    from targets t
   where h.id = t.homework_id
  returning h.id, h.total_marks
),
zeroed as (
  update answers a
     set final_marks = 0,
         auto_marks  = 0
    from targets t
   where a.question_id = t.id
  returning a.id
)
select (select count(*) from converted)  as questions_converted,
       (select count(*) from retotalled) as homeworks_retotalled,
       (select count(*) from zeroed)     as answers_zeroed;

-- ── 7. the prompts stop pointing at the group chat ─────────────────────
-- The recording is made on the page now, so every prompt that said to send a
-- voice note to the class chat says "here" instead. Keyed by id; the
-- `is distinct from` guard makes the printed count 0 on a re-run.
with new_prompts (id, prompt) as (
  values
    ('9b20e0ff-1b71-4f9e-a301-0dbc48939819'::uuid,
     E'Final Task: Record yourself reciting all of Surah Al-Fajr here.\n\nAt the end of the recording, identify the instances where this week''s rules apply.'),
    ('282c14de-ee1c-49b7-9b4a-5619dc0e6d5b'::uuid,
     'Final Task: Find 5 example verses with Idhaar Halqi and record yourself reciting them here.'),
    ('3f41e720-539d-40a3-bb35-ca2f41a92608'::uuid,
     'Final Task: Find 3 instances of Iqlab in the last juz and record yourself reciting them here.'),
    ('ef52a458-3c54-4d83-b84f-965cbb635aba'::uuid,
     'Final Task: Record yourself reciting Surah Al-Infitar here, observing every Ikhfaa.'),
    ('ef1ed6df-946b-4b6d-9db1-86dcffe52a54'::uuid,
     'Final Task: Record yourself reciting Surah An-Naba'' here, observing all the rules of noon sakinah and tanween.'),
    ('3f3df141-3f85-42e6-b1d8-9350275dc082'::uuid,
     'Final Task: Record yourself here reciting 3 examples of each rule.'),
    ('d3a5acbe-d262-4fef-ac97-ea23cf6a0578'::uuid,
     'Final Task: Record yourself reciting Surah At-Tariq here.'),
    ('d0094a38-5d75-4796-a6fe-e82232a406c3'::uuid,
     'Record yourself here giving examples of 5 heavy Ra (with 2 being sakin), then another 5 which are light (with 2 being sakin).'),
    ('90e260c4-2ca9-43b0-8fd5-71bbc7d3425b'::uuid,
     'Record yourself reciting the whole of Surah Al-Muddathir here.'),
    ('56df7077-7751-4bf3-b360-9ff8c7f253a7'::uuid,
     'HW Task: Find 5 examples of Madd Asli and record yourself reciting them here.'),
    ('8a50f02a-c96a-44ed-9158-bcdd86e09720'::uuid,
     'HW Task: Record yourself reciting Surah At-Tariq here, then identify where the Madd Muttasil occur after the recitation.')
),
rewritten as (
  update questions q
     set prompt = n.prompt
    from new_prompts n
   where q.id = n.id
     and q.prompt is distinct from n.prompt
  returning q.id
)
select count(*) as prompts_rewritten from rewritten;
