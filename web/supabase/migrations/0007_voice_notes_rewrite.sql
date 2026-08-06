-- ═══════════════════════════════════════════════════════════════════════
-- Voice notes: make them re-recordable.
--
-- 0001 created the bucket and insert/read policies but no way to REPLACE a
-- recording — no unique key to upsert against, and no storage update/delete
-- policy. A student who fluffed their recitation was stuck with take one.
--
-- Writes are restricted to draft submissions, matching how `answers` behave:
-- once the work is handed in, the recording is part of it.
-- ═══════════════════════════════════════════════════════════════════════

-- One note per question per submission, so the app can upsert.
create unique index if not exists voice_notes_submission_question_key
  on voice_notes (submission_id, question_id);

-- ---- voice_notes row policies ----
drop policy if exists s_vn_insert on voice_notes;
create policy s_vn_insert on voice_notes for insert with check (
  exists (
    select 1 from submissions s
    where s.id = submission_id and s.student_id = auth.uid() and s.status = 'draft'
  )
);

drop policy if exists s_vn_update on voice_notes;
create policy s_vn_update on voice_notes for update
  using (
    exists (
      select 1 from submissions s
      where s.id = submission_id and s.student_id = auth.uid() and s.status = 'draft'
    )
  )
  with check (
    exists (
      select 1 from submissions s
      where s.id = submission_id and s.student_id = auth.uid() and s.status = 'draft'
    )
  );

drop policy if exists s_vn_delete on voice_notes;
create policy s_vn_delete on voice_notes for delete using (
  exists (
    select 1 from submissions s
    where s.id = submission_id and s.student_id = auth.uid() and s.status = 'draft'
  )
);

-- ---- storage object policies ----
-- Overwriting an object is an UPDATE in storage.objects; without this, an
-- upload with upsert:true fails with a policy violation.
drop policy if exists vn_student_update on storage.objects;
create policy vn_student_update on storage.objects for update
  using (
    bucket_id = 'voice-notes' and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'voice-notes' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists vn_student_delete on storage.objects;
create policy vn_student_delete on storage.objects for delete using (
  bucket_id = 'voice-notes' and (storage.foldername(name))[1] = auth.uid()::text
);
