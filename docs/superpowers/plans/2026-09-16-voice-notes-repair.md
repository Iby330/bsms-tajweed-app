# Voice notes — make the teacher hear them

Date: 2026-09-16. Branch: `feat/teacher-hearings`. Paths relative to `web/` unless they start with `execution/` or `docs/`.

## Context

Students already record a recitation on any `is_task` question (`VoiceRecorder` →
private `voice-notes` bucket → `voice_notes` row). The teacher never hears it:
`review-panel.tsx` skips every question without an `answers` row, and a task
question never gets one because the form only writes answers for typed/picked
responses. `past-attempts.tsx` has the same gate. A redo (migration 0030)
reuses the storage path so a re-record overwrites the earlier attempt's audio.
One recording exists in production; the feature has effectively never worked.

Decisions (user, 2026-09-16): recordings are **not marked** — the teacher
listens and may leave a comment that reaches the student. The four "Final
Task: send a recording…" questions that are tick-boxes become recording tasks
worth 0. Prompt wording that says "send it to the group chat" is rewritten to
say the recording is made here. A student **cannot submit** until every task
on the paper has a recording.

## Design

**An `answers` row accompanies every recording.** `saveVoiceNote` upserts
`answers` with a fourth response shape `{"voice": "<storage_path>"}` next to
the `voice_notes` upsert; `deleteVoiceNote` removes both. This gives the
teacher's comment a row to live on (`teacher_comment`) with no change to how
comments are released or shown to the student. `scoreObjective` already
scores a task 0, so the row lands at `auto_marks = 0` and never reaches the
LLM. `responseIsEmpty` must learn the shape so a recitation is not counted
"blank" in class stats.

**Rowless tasks still render.** The review panel and past attempts render a
task question with no `answers` row as prompt + "Nothing recorded for this
task." — no mark input, no comment box — so the teacher sees the task exists.

**Storage path carries the attempt:** `${uid}/${submissionId}/a${attempt}/${questionId}.${ext}`.
`storage.foldername(name)[1]` and `[2]` mean the same on old and new paths.
The single legacy row keeps its path; playback reads `storage_path` off the row.

**Storage write-lock after hand-in.** Policies on `storage.objects` for the
bucket require own folder AND the submission named by segment 2 to be a
draft owned by the caller. The uuid cast is regex-guarded because storage
policies are OR'd across buckets and would run for avatar uploads too.

**Submit gate.** Client: the Submit button is disabled with a hint
("Record every task before you hand in") until each task question has a
recording; `VoiceRecorder` reports its state up. Server: `submitHomework`
refuses when any `is_task` question of the homework lacks a `voice_notes`
row (question list via `get_homework_for_student`, which the student client
may call).

## Task A — migration `supabase/migrations/0031_voice_notes_hardening.sql`

Idempotent throughout; house style as in 0029/0030. Sections:

1. Bucket limits: `on conflict (id) do update` setting `file_size_limit = 25 MB`,
   `allowed_mime_types = array['audio/*']`, `public = false`.
2. `public.voice_note_submission(object_name text) returns uuid` — sql,
   immutable, strict; regex-guarded cast of `(storage.foldername(name))[2]`.
   `public.voice_note_writable(object_name text) returns boolean` — sql,
   stable; own folder and `exists (submissions where id = … and student_id = auth.uid() and status = 'draft')`.
3. `drop policy if exists` + recreate `vn_student_insert` / `vn_student_update`
   / `vn_student_delete` on `storage.objects` `to authenticated` using
   `bucket_id = 'voice-notes' and public.voice_note_writable(name)`. Leave the
   read policy alone.
4. `s_ans_delete` on `answers`: draft-only, mirroring `s_ans_insert`.
5. Backfill: an `answers` row `{"voice": storage_path}`, `auto_marks 0`, for
   every `voice_notes` row without one.
6. Convert the four tick-box tasks. Target by **question id** (probe first:
   `(homework number, position)` = (6,10), (7,17), (8,9), (17,7); their ids
   begin `ef52a458`, `ef1ed6df`, `3f3df141`, `8a50f02a`). For each:
   `is_task = true, qtype = 'text', scoring = 'manual', options = null, points = 0`;
   `homeworks.total_marks = total_marks - 1` for those four homeworks (guard:
   only when the question row still has `is_task = false` so a re-run is a
   no-op); `answers` on those questions: `final_marks = 0, auto_marks = 0`.
   Use `returning` so the applied row count is printed.
7. Rewrite the eleven prompts, by question id (probe for the full ids of the
   seven `is_task = true` ones by `(homework number, position)`):

   | hw · pos | new prompt |
   | --- | --- |
   | 2 · 7 | Final Task: Record yourself reciting all of Surah Al-Fajr here.\n\nAt the end of the recording, identify the instances where this week's rules apply. |
   | 3 · 9 | Final Task: Find 5 example verses with Idhaar Halqi and record yourself reciting them here. |
   | 5 · 6 | Final Task: Find 3 instances of Iqlab in the last juz and record yourself reciting them here. |
   | 6 · 10 | Final Task: Record yourself reciting Surah Al-Infitar here, observing every Ikhfaa. |
   | 7 · 17 | Final Task: Record yourself reciting Surah An-Naba' here, observing all the rules of noon sakinah and tanween. |
   | 8 · 9 | Final Task: Record yourself here reciting 3 examples of each rule. |
   | 9 · 7 | Final Task: Record yourself reciting Surah At-Tariq here. |
   | 11 · 9 | Record yourself here giving examples of 5 heavy Ra (with 2 being sakin), then another 5 which are light (with 2 being sakin). |
   | 13 · 7 | Record yourself reciting the whole of Surah Al-Muddathir here. |
   | 16 · 7 | HW Task: Find 5 examples of Madd Asli and record yourself reciting them here. |
   | 17 · 7 | HW Task: Record yourself reciting Surah At-Tariq here, then identify where the Madd Muttasil occur after the recitation. |

Apply with `npx tsx execution/apply_migration.ts web/supabase/migrations/0031_voice_notes_hardening.sql`
from the repo root; verify with `--probe` (bucket limits, policy names,
`count(*)` of answers joined to voice_notes, the four questions' `is_task/points`,
the four homeworks' `total_marks`, one rewritten prompt).
`src/lib/database.types.ts`: add the two functions to `Functions`
(`voice_note_submission: { Args: { object_name: string }; Returns: string }`,
`voice_note_writable: { Args: { object_name: string }; Returns: boolean }`).
Add a LEARNINGS.md line: storage policies are OR'd across buckets, guard casts.

## Task B — student side

- `src/lib/homework/logic.ts`: document the `{voice}` shape; `VoiceResponse`,
  `voiceResponse(path)`, `voiceOf(response)`; `responseIsEmpty` treats a
  non-blank `voice` string as not empty. Tests.
- `src/lib/voice/path.ts` (new): `voiceObjectPath(uid, submissionId, attempt, questionId, ext)`
  and `submissionIdFromPath(path)`; tests incl. legacy path.
- `src/lib/voice/actions.ts`: `saveVoiceNote` also upserts the `answers` row
  (`onConflict: "submission_id,question_id"`); `deleteVoiceNote` deletes both;
  both `revalidatePath("/homework/[n]", "page")` instead of `/homework`.
- `src/components/app/voice-recorder.tsx`: `attempt` prop; path via
  `voiceObjectPath`; `contentType: blob.type.split(";")[0]`; readable errors
  for too-large / wrong-type uploads; `onRecorded?: (hasRecording: boolean) => void`
  called after save and after discard (and on mount with the initial state).
- `src/components/app/homework-form.tsx`: `attempt?: number` (default 1) passed
  through; track recorded state per task question (seeded from `voiceNotes`);
  Submit disabled while any task lacks a recording, with the hint text in the
  status line where "Your work saves as you type." sits.
- `src/app/(student)/homework/[n]/page.tsx`: pass `attempt={sub?.attempt ?? 1}`.
- `src/lib/homework/actions.ts` `submitHomework`: fetch the paper via
  `db.rpc("get_homework_for_student", { hw_id })` and `voice_notes` for the
  submission; if any `is_task` question has no note, return without
  submitting (throw `Error("Record every task before you hand in.")` so the
  form can show it). Pure helper `missingTaskRecordings(questions, notes)` in
  `logic.ts` with tests.

## Task C — teacher side

- `src/components/app/review-panel.tsx`: `if (!a && !q.is_task) return null;`
  rowless task → header, "task" chip, prompt, "Student recitation" box with
  `VoicePlayback` if a note exists else "Nothing recorded for this task."; no
  mark column, no comment box. Every `a.`-derived piece conditional on `a`.
  For a task WITH a row: no mark input (tasks are unmarked; render "—" where
  the mark field would be), playback, comment box as today.
- `src/components/app/past-attempts.tsx`: same gate; drive the task rendering
  from the voice snapshot; empty state only when both snapshots are empty;
  mark shows "—" for tasks.
- `src/components/app/question-breakdown.tsx`: check the "Recitations" list
  now lists `{voice}` rows sensibly (it should, via `responseIsEmpty`).
- Tests: `review-panel.test.tsx` (mock `@/lib/supabase/client` for
  `VoicePlayback`): task with note but no row renders playback and no
  `#mark-`/`#comment-`; task with neither → "Nothing recorded"; task with row
  + note → comment box, comment reaches `approveSubmission` keyed by answer id;
  non-task with no row still skipped; total ignores rowless task. New
  `past-attempts.test.tsx` covering the same four cases plus a malformed
  snapshot. `responses.test.ts`: `questionStats` counts a `{voice}` row as
  answered, not blank. `plan.test.ts`: a `{voice}` task row yields no LLM job
  and `auto_marks: 0`.

## Verification

`cd web && npx vitest run && npx tsc --noEmit && npm run build`, eslint on
touched files. Then a manual pass with a student and a teacher account:
record → teacher hears it and comments → student sees the comment; submit
blocked until every task is recorded; redo records to `a2/` and attempt 1's
audio survives under Previous attempts; upload after hand-in is refused.
