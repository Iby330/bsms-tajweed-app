-- Two recordings reached Storage but were never pointed at their homework.
--
-- The recorder uploads the audio from the browser, then calls the
-- saveVoiceNote server action to write the voice_notes and answers rows. A
-- page opened before a deploy keeps the old build's action ids, so that call
-- failed and the recording sat in the bucket with nothing pointing at it:
--   * Ilham, Qāʿidah HW 302: uploaded 16:14 UTC, 6 min after a3224d1 went live
--     (4 min 18 s of audio).
--   * Yusef, HW 202 Q8: uploaded 21:27:07 UTC on 11 Oct, 4 s after e244495
--     went live (23 s of audio).
-- Both drafts are still open, so this writes the rows saveVoiceNote would
-- have written and the student only has to hand in. Durations were read from
-- the files with ffmpeg.

begin;

with stranded(submission_id, question_id, storage_path, duration_s) as (values
  ('e7dc4e44-1dbf-4905-97a6-a77f2e4016e8'::uuid, '149d6952-9b29-4a59-a178-541381ce9226'::uuid,
   '272b19fb-a4ee-403b-a02e-ef56a4094620/e7dc4e44-1dbf-4905-97a6-a77f2e4016e8/a1/149d6952-9b29-4a59-a178-541381ce9226.webm', 259),
  ('be9c023e-1cb1-4c48-b24c-2d016e3e2398'::uuid, '3be9b475-10e0-4cc8-b3a6-4e753e85e6ed'::uuid,
   '432a483c-f002-4293-9ad1-fabc5a724c98/be9c023e-1cb1-4c48-b24c-2d016e3e2398/a1/3be9b475-10e0-4cc8-b3a6-4e753e85e6ed.webm', 23)
), live as (
  -- Only a draft still on attempt 1 whose file is really there.
  select st.* from stranded st
    join submissions s on s.id = st.submission_id and s.status = 'draft' and s.attempt = 1
    join storage.objects o on o.bucket_id = 'voice-notes' and o.name = st.storage_path
), notes as (
  insert into voice_notes (submission_id, question_id, storage_path, duration_s)
  select submission_id, question_id, storage_path, duration_s from live
  on conflict (submission_id, question_id) do nothing
  returning submission_id
)
insert into answers (submission_id, question_id, response)
select submission_id, question_id, jsonb_build_object('voice', storage_path) from live
on conflict (submission_id, question_id) do nothing;

commit;
