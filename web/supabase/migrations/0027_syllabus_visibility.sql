-- ═══════════════════════════════════════════════════════════════════════
-- Content visibility follows the class's syllabus.
--
-- 0026 recorded the facts and changed nothing. This one changes what students
-- can READ, and it is the security boundary, so it is worth being exact about
-- what it does.
--
-- BEFORE: a lesson or homework was visible to every student the moment its
-- week unlocked. One calendar, one programme, everybody sees everything.
--
-- AFTER: a student sees an item only if their class takes its course, and
-- only once it has opened FOR THEIR CLASS — which is computed from the term
-- that class takes the course in, not the term the row is filed under. Group
-- 1's Mudūd opens in Term 1 for them and stays in Term 3 for everybody else,
-- off the same six rows.
--
-- THE FALLBACK MATTERS AS MUCH AS THE RULE. A class with no syllabus — the
-- sisters' four classes and the two unassigned demo cohorts — keeps the old
-- week-based behaviour exactly. Nobody loses sight of content they can see
-- today because their curriculum has not been written down yet.
--
-- A CONSEQUENCE WORTH STATING. Masjid Al-Aqsa take Qāʿidah Nūrāniyyah and Umm
-- al-Kitāb, and the app holds no homework for either. Their students will
-- therefore see no homework at all, where before they saw Ghunna's. That is
-- the intended behaviour — they are not studying Ghunna — but it is a real
-- change for four students, and the teacher screen says "no homework for this
-- course yet" so it reads as missing content rather than a broken app.
--
-- TO ROLL BACK, restore the two policies at the bottom of this file's
-- comment. They are the originals, verbatim:
--
--   create policy s_lessons_unlocked on lessons for select using (
--     (exists (select 1 from weeks w
--               where w.id = lessons.week_id and w.unlock_at <= now()))
--     or sees_all_content());
--   create policy s_homeworks_unlocked on homeworks for select using (
--     (exists (select 1 from weeks w
--               where w.id = homeworks.week_id and w.unlock_at <= now()))
--     or sees_all_content());
--
-- Every statement is idempotent so a half-applied batch can be re-run.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. The new tables are readable, and writable only by teachers ────────
--
-- 0026 created `courses` and `class_courses` without RLS, which in Supabase
-- leaves them open through PostgREST. They are curriculum metadata rather
-- than anything private — the same standing as `classes`, which every signed-
-- in user can already read — so the read policy matches `s_classes_read`
-- rather than inventing a narrower rule the app would have to work around.
-- The app reads `class_courses` directly (getClassSchedule), so this grant is
-- load-bearing, not housekeeping.
alter table courses       enable row level security;
alter table class_courses enable row level security;

drop policy if exists t_courses on courses;
create policy t_courses on courses for all using (is_teacher()) with check (is_teacher());
drop policy if exists s_courses_read on courses;
create policy s_courses_read on courses for select using (auth.uid() is not null);

drop policy if exists t_class_courses on class_courses;
create policy t_class_courses on class_courses
  for all using (is_teacher()) with check (is_teacher());
drop policy if exists s_class_courses_read on class_courses;
create policy s_class_courses_read on class_courses
  for select using (auth.uid() is not null);

-- ── 2. One question, asked in one place ──────────────────────────────────
--
-- "Can the current user see this item yet?" Both content policies call this
-- rather than repeating the logic, so the two can never drift apart — and the
-- app's `scheduledUnlockAt` in tree.ts is the third copy of the same
-- arithmetic, kept honest by its tests.
--
-- SECURITY DEFINER because it reads `profiles` and `class_courses` on behalf
-- of a user who can only see their own profile row. It takes no user id: it
-- always asks about `auth.uid()`, so it cannot be called to probe what
-- somebody else can see. `search_path` is pinned, which a definer function
-- without one would leave open to being resolved against a caller-controlled
-- schema.
create or replace function can_see_content(
  p_course uuid, p_ordinal int, p_week uuid
) returns boolean
language sql stable security definer set search_path = public as $$
  with me as (select class_id from profiles where id = auth.uid())
  select case
    -- Class has a syllabus: it decides, and a course the class does not take
    -- yields NULL from class_item_unlock_at, which is "never".
    when exists (select 1 from class_courses cc, me where cc.class_id = me.class_id)
      then coalesce(
        (select class_item_unlock_at(me.class_id, p_course, greatest(coalesce(p_ordinal, 1), 1))
           from me) <= now(),
        false)
    -- No syllabus: the original whole-programme, week-based rule.
    else exists (select 1 from weeks w where w.id = p_week and w.unlock_at <= now())
  end;
$$;

comment on function can_see_content(uuid, int, uuid) is
  'Whether the CURRENT user may read a content row yet. Syllabus-driven for a '
  'class that has one, week-driven for a class that does not. Used by the RLS '
  'policies on lessons and homeworks.';

grant execute on function can_see_content(uuid, int, uuid) to authenticated, anon;

-- ── 3. The policies ──────────────────────────────────────────────────────
--
-- `sees_all_content()` (profiles.unlock_all) still wins, and teachers are
-- unaffected — `t_lessons` / `t_homeworks` are separate ALL policies, and
-- Postgres ORs permissive policies together, so a teacher keeps seeing the
-- whole year including everything still locked. That is deliberate: preparing
-- next term is the work.
drop policy if exists s_lessons_unlocked on lessons;
create policy s_lessons_unlocked on lessons for select using (
  sees_all_content()
  or can_see_content(lessons.course_id, lessons.ordinal, lessons.week_id)
);

drop policy if exists s_homeworks_unlocked on homeworks;
create policy s_homeworks_unlocked on homeworks for select using (
  sees_all_content()
  or can_see_content(homeworks.course_id, homeworks.ordinal, homeworks.week_id)
);
