-- ═══════════════════════════════════════════════════════════════════════
-- Range hearings: a hearing runs from one surah to another, and its
-- per-surah result is derived from the pass records, so `outcome` goes.
-- Spec: docs/superpowers/specs/2026-09-16-range-hearings-design.md
-- Every statement idempotent so a half-applied batch can be re-run.
-- ═══════════════════════════════════════════════════════════════════════

-- Memorisation order runs down the mushaf, so the end is the LOWER number.
-- A hearing of one surah has the two equal.
alter table revision_sessions add column if not exists to_surah_number int references surahs(number);

-- Hearings made before this column existed were one surah each.
update revision_sessions set to_surah_number = surah_number
  where kind = 'hearing' and to_surah_number is null;

alter table revision_sessions drop constraint if exists revision_sessions_hearing_to_check;
alter table revision_sessions add constraint revision_sessions_hearing_to_check
  check ((kind = 'hearing') = (to_surah_number is not null));

alter table revision_sessions drop constraint if exists revision_sessions_range_order_check;
alter table revision_sessions add constraint revision_sessions_range_order_check
  check (to_surah_number is null or to_surah_number <= surah_number);

-- The verdict is per surah now and lives in hifz_records: a record exists
-- only while the latest word on that surah was a pass. Nothing reads
-- `outcome` any more.
alter table revision_sessions drop constraint if exists revision_sessions_outcome_check;
alter table revision_sessions drop constraint if exists revision_sessions_peer_no_outcome_check;
alter table revision_sessions drop column if exists outcome;
