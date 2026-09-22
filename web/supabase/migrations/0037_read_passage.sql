-- ═══════════════════════════════════════════════════════════════════════
-- What we asked an applicant to read, and three states instead of five.
--
-- THE PASSAGE. The recitation session works from a passage chosen for each
-- applicant, and until now there was nowhere to put it: "what you heard" is
-- the verdict, not the question. Held as surah number plus an ayah range
-- rather than a sentence, so the screen can offer real ayah numbers and the
-- same passage reads the same way on every row. The names and ayah counts
-- live in the app (lib/quran/surahs.ts); the database records the numbers.
--
-- THE STATES. The enum keeps all five values, because an enum value cannot
-- be dropped in Postgres without rewriting the type, and nothing is gained
-- by it: the screen now offers only New, Placed and Declined, which is the
-- whole of what the intake actually does. Any row left in 'invited' or
-- 'assessed' is moved to 'new' here so nothing sits in a state the screen
-- can no longer show.
--
-- Every statement is idempotent so a half-applied batch can be re-run.
-- ═══════════════════════════════════════════════════════════════════════

alter table applications
  add column if not exists read_surah smallint
    check (read_surah between 1 and 114),
  -- The upper bound is the longest surah, Al-Baqarah's 286 ayahs. The real
  -- bound is per surah and the form enforces it; this only keeps a wild
  -- number out of the column.
  add column if not exists read_ayah_from smallint
    check (read_ayah_from between 1 and 286),
  add column if not exists read_ayah_to smallint
    check (read_ayah_to between 1 and 286);

-- A range that runs backwards is not a range. Both null (nothing recorded)
-- and a bare start with no end (a single ayah) stay allowed.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'applications_read_range_ck'
  ) then
    alter table applications add constraint applications_read_range_ck
      check (read_ayah_to is null or read_ayah_from is null
             or read_ayah_to >= read_ayah_from);
  end if;
end $$;

comment on column applications.read_surah is
  'Surah we asked them to read at the recitation session. Names and ayah '
  'counts live in the app, lib/quran/surahs.ts.';

update applications set status = 'new' where status in ('invited', 'assessed');
