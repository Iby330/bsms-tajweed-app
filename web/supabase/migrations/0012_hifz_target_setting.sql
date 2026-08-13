-- Teacher-set hifz targets: class default + per-student override.
--
-- is_custom marks a profile the teacher set individually (returning students,
-- personal targets). The class-wide default only ever writes rows where
-- is_custom is false, so re-applying it never tramples an override.
--
-- Backfill: a row whose start_surah isn't An-Nas (114) can only have been set
-- by hand for a returning student — mark those custom so the first class-wide
-- apply doesn't reset them.

alter table hifz_profiles add column if not exists is_custom boolean not null default false;

update hifz_profiles set is_custom = true where start_surah <> 114 and not is_custom;
