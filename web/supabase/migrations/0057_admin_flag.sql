-- Admin: a teacher account that crosses the brothers/sisters line.
--
-- The teacher screens keep each teacher to their own section (lib/teacher/
-- scope.ts). An admin oversees the whole programme without teaching in it,
-- so the app lets them open every class on both sides. Their role stays
-- 'teacher', which RLS already lets see and change the whole cohort, so no
-- policy changes: this flag only widens what the screens offer.
--
-- Students cannot set it: their only profiles policy is select-own.

alter table profiles add column if not exists is_admin boolean not null default false;

comment on column profiles.is_admin is
  'Teacher who may open both sections. Screens only; RLS is unchanged.';
