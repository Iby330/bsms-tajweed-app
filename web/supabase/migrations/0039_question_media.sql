-- ═══════════════════════════════════════════════════════════════════════
-- A question can carry audio.
--
-- THE PROBLEM. Tajweed is heard before it is named, and the homework could
-- only ever show a student text. Two kinds of question need a recitation:
--
--   · "Name the rule you heard": an ordinary multiple-choice question whose
--     prompt says "Listen to this recitation of …". It plays a SLICE of one
--     ayah, two or three words, so the student hears the rule and not the
--     whole ayah around it, and replays it as often as they like.
--   · Options that are ayahs, each with a play button of its own.
--
-- THE SHAPE. One nullable jsonb column, both keys optional:
--
--   {"clip":         {"url": "https://…/090006.mp3", "start_ms": 3590,
--                     "end_ms": 6200, "label": "Al-Balad 90:6"},
--    "option_audio": {"1": {"url": "https://…/047005.mp3"},
--                     "2": {"url": "…", "start_ms": 0, "end_ms": 4000}}}
--
-- `option_audio` is keyed by the option's `position`, the same number the
-- answer records, so the audio follows the option whatever order it is shown
-- in. The URLs point at a public per-ayah MP3 mirror; no audio is stored here.
--
-- jsonb rather than columns because this is authored by hand, a question at a
-- time, and is read in exactly one place (lib/homework/media.ts) which drops
-- anything malformed rather than failing the page. A CHECK constraint would
-- only move a typo's failure from the page to the insert, and the page
-- already copes. That module also only plays audio from a short list of
-- Qur'an audio hosts, so a student's browser is never pointed anywhere else.
--
-- WHAT A STUDENT IS SENT. Not the column as stored. get_homework_for_student
-- passes on `clip` and `option_audio` BY NAME and nothing else, so a key
-- added to `media` later (a teacher's note, "the rule here is ikhfa'") can
-- never reach a student by being stored next to the audio. The same reason
-- the function rebuilds each option from position/label/value instead of
-- copying it: a whitelist fails closed, a pass-through fails open.
--
-- THE GATE, FIXED WHILE WE ARE HERE. Since 0027 a class's syllabus decides
-- when its content opens (group 1 takes Mudūd in Term 1, groups 2–4 in Term
-- 3), and the homeworks RLS policy asks `sees_all_content() or
-- can_see_content(course_id, ordinal, week_id)`. The RPC was never brought
-- along: it still asked whether the homework's own WEEK had unlocked. So:
--
--   · a homework the syllabus has opened for a class but whose week is still
--     ahead was listed for the student (RLS let the row through) and then
--     404'd when they opened it (the RPC returned null). That is every early
--     course for group 1, and it is a launch blocker;
--   · the reverse leaked: a paper whose week had passed but which is outside
--     the class's syllabus was hidden from the list and yet fetchable, whole,
--     by anyone holding its id.
--
-- The gate below is the policy's own predicate, word for word, so the list
-- and the page answer the same question and cannot drift apart again.
--
-- Note the base this replaces. The live function is NOT 0001's: the
-- untracked-in-git 0023_unlock_all.sql (docs/schema-drift.md §1) widened the
-- week gate with `or sees_all_content()` for the demo account. That is kept,
-- as the first half of the new gate. Everything else, the payload and the
-- stripping of options[].correct and rubric, is that definition verbatim.
--
-- WHAT DOES NOT CHANGE. Scoring is untouched: a listening question is an
-- ordinary mcq and is marked like one. RLS is untouched: the column rides on
-- the existing questions policies. The function stays `stable security
-- definer set search_path = public`. Both helpers it now calls are the same
-- kind (0023, 0027) and read only on behalf of auth.uid().
--
-- After applying, web/supabase/checks/homework_rpc.sql checks, as a chosen
-- student, that the list and the RPC agree on every homework and that no
-- answer key or stray media key comes back.
--
-- Every statement is idempotent so a half-applied batch can be re-run.
-- ═══════════════════════════════════════════════════════════════════════

alter table questions add column if not exists media jsonb;

comment on column questions.media is
  'Audio the question carries: {"clip": {url, start_ms, end_ms, label?}, '
  '"option_audio": {"<option position>": {url, start_ms?, end_ms?}}}, both '
  'keys optional, https URLs on an allowlisted host only. Parsed by '
  'web/src/lib/homework/media.ts, which ignores anything malformed. Only '
  'clip and option_audio are sent to students (get_homework_for_student). '
  'Migration 0039.';

-- ═══════════ RPC: sanitized homework fetch for students ═══════════
-- Returns questions with options[].correct and rubric STRIPPED so answer
-- keys never reach the client. Teachers query the table directly instead.
-- 0039: gated like the homeworks RLS policy (sees_all_content() or
-- can_see_content(...)), and returns `media` cut down to clip/option_audio.
create or replace function get_homework_for_student(hw_id uuid)
returns jsonb
language sql stable security definer set search_path = public as
$$
  select case
    when not exists (
      select 1 from homeworks h
      where h.id = hw_id
        and (sees_all_content() or can_see_content(h.course_id, h.ordinal, h.week_id))
    ) then null
    else (
      select jsonb_build_object(
        'homework', jsonb_build_object(
          'id', h.id, 'number', h.number, 'title', h.title,
          'series', h.series, 'total_marks', h.total_marks,
          'due_at', h.due_at, 'is_graded', h.is_graded
        ),
        'questions', coalesce(jsonb_agg(
          jsonb_build_object(
            'id', q.id, 'position', q.position, 'qtype', q.qtype,
            'prompt', q.prompt, 'points', q.points,
            'is_bonus', q.is_bonus, 'is_task', q.is_task,
            'options', (
              select jsonb_agg(jsonb_build_object(
                'position', o->'position', 'label', o->'label', 'value', o->'value'
              ) order by (o->>'position')::int)
              from jsonb_array_elements(q.options) o
            ),
            -- Named keys only, at every level: see WHAT A STUDENT IS SENT
            -- above. A note tucked inside `clip` or an option's entry is as
            -- much a leak as one beside them, so those are rebuilt field by
            -- field too. jsonb_each needs an object, hence the typeof guards;
            -- strip_nulls then drops whatever was absent, so a media object
            -- with nothing playable in it comes back `{}`, which the app
            -- reads as no audio.
            'media', case when q.media is null then null
                     else jsonb_strip_nulls(jsonb_build_object(
                       'clip', case when jsonb_typeof(q.media->'clip') = 'object'
                         then jsonb_build_object(
                           'url',      q.media->'clip'->'url',
                           'start_ms', q.media->'clip'->'start_ms',
                           'end_ms',   q.media->'clip'->'end_ms',
                           'label',    q.media->'clip'->'label'
                         ) end,
                       'option_audio', (
                         select jsonb_object_agg(e.key, jsonb_build_object(
                           'url',      e.value->'url',
                           'start_ms', e.value->'start_ms',
                           'end_ms',   e.value->'end_ms'
                         ))
                         from jsonb_each(case when jsonb_typeof(q.media->'option_audio') = 'object'
                                              then q.media->'option_audio' else '{}'::jsonb end) e
                         where jsonb_typeof(e.value) = 'object'
                       )
                     )) end
          ) order by q.position
        ) filter (where q.id is not null), '[]'::jsonb)
      )
      from homeworks h
      left join questions q on q.homework_id = h.id
      where h.id = hw_id
      group by h.id
    )
  end
$$;
