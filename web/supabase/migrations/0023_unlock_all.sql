-- One student who sees the whole year, so the year can be demonstrated.
--
-- Content is released week by week: `weeks.unlock_at` gates the RLS policies
-- `s_lessons_unlocked` / `s_homeworks_unlocked`, and the sanitized RPC
-- `get_homework_for_student` returns null for a week that has not opened. That
-- is right for a real student — but it makes the demo account useless for a
-- walkthrough, because a preview in October can only ever show October. Term 2
-- and Term 3 are invisible to the very account we use to show the product.
--
-- So: a per-profile flag. `unlock_all` true means this reader is exempt from
-- the calendar and sees every lesson and homework the moment it exists. The
-- default is FALSE, so nothing changes for anyone already in the table — the
-- flag is opt-in, one row at a time, and this migration turns it on for
-- exactly one row: the demo student adam.w@bsms-demo.test.
--
-- It is deliberately NOT `role = 'teacher'` reused. A teacher sees locked rows
-- because preparing next term is their job; a demo student sees them because
-- we are showing the product. Same effect, different reason, and conflating
-- the two would mean a demo student inheriting every other teacher power.
--
-- `sees_all_content()` mirrors `is_teacher()` exactly — sql / stable / security
-- definer / search_path = public — so the policies can call it without the
-- recursive-RLS problem that a bare `select from profiles` inside a policy has.
--
-- Drift check before writing this: the live definition of
-- get_homework_for_student(uuid) was fetched with pg_get_functiondef and
-- diffed against 0001_core.sql. They are IDENTICAL apart from Postgres's own
-- re-formatting of the header (`RETURNS jsonb / LANGUAGE sql / STABLE SECURITY
-- DEFINER / SET search_path TO 'public'` and `$function$` delimiters). The body
-- is byte-for-byte the 0001 text, so nothing outside the migrations folder had
-- altered it, and the replacement below is the live body with one clause
-- changed. The two policies were checked the same way in pg_policies and also
-- matched 0001.
--
-- Every statement is idempotent: `add column if not exists`, `create or
-- replace function`, `drop policy if exists` before each `create policy`, and
-- an UPDATE that is a no-op on a second run. The UPDATE carries RETURNING so
-- the applied output proves it matched the row rather than silently matching
-- none (a zero-row UPDATE still returns 201 from the Management API).

alter table profiles
  add column if not exists unlock_all boolean not null default false;

comment on column profiles.unlock_all is
  'True for demo/preview accounts that must see every lesson and homework '
  'regardless of weeks.unlock_at. Read by sees_all_content(), which the '
  'content policies and get_homework_for_student() consult. Default false — '
  'no real student is ever exempt from the release calendar.';

-- ═══════════ helper ═══════════
-- Same shape as is_teacher(): security definer so a policy can read profiles
-- without re-entering profiles' own RLS, stable so the planner may hoist it.
create or replace function sees_all_content() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from profiles where id = auth.uid() and unlock_all) $$;

comment on function sees_all_content() is
  'Is the current reader exempt from the weekly release calendar? The app '
  'mirrors this in buildTree/buildCatalogue''s `unlockAll` option — change one '
  'and change the other, or the screens and RLS will disagree.';

-- ═══════════ policies ═══════════
drop policy if exists s_lessons_unlocked on lessons;
create policy s_lessons_unlocked on lessons for select using (
  exists (select 1 from weeks w where w.id = week_id and w.unlock_at <= now())
  or sees_all_content()
);

drop policy if exists s_homeworks_unlocked on homeworks;
create policy s_homeworks_unlocked on homeworks for select using (
  exists (select 1 from weeks w where w.id = week_id and w.unlock_at <= now())
  or sees_all_content()
);

-- ═══════════ RPC ═══════════
-- Verbatim the live definition, with the gate widened by sees_all_content().
-- Everything else — including the stripping of options[].correct and rubric,
-- which is the reason this function exists — is untouched.
create or replace function get_homework_for_student(hw_id uuid)
returns jsonb
language sql stable security definer set search_path = public as
$$
  select case
    when not exists (
      select 1 from homeworks h join weeks w on w.id = h.week_id
      where h.id = hw_id and (w.unlock_at <= now() or sees_all_content())
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
            )
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

-- ═══════════ the one row ═══════════
-- Matched through auth.users by email rather than by name: full_name is edited
-- from the app, the email is not. RETURNING so a zero-row match is visible.
update profiles
   set unlock_all = true
 where id in (select id from auth.users where email = 'adam.w@bsms-demo.test')
returning id, full_name, unlock_all;
