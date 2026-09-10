-- ═══════════════════════════════════════════════════════════════════════
-- The real teaching calendar for 2026/27.
--
-- Two changes, and the second is the reason for the first.
--
--  1. `terms` finally holds the faculty dates. It has carried placeholders
--     since 0002 ("placeholder dates until faculty calendar drops"), and they
--     disagreed with the hard-coded year in lib/attendance/calendar.ts on
--     every boundary. Both now say the same thing.
--
--  2. `session_t` stops meaning a weekday and starts meaning a subject.
--     Tajweed is Monday for both sections, but hifdh is Thursday for the
--     brothers and Wednesday for the sisters — so 'monday' and 'thursday'
--     cannot name the two weekly sessions any more. The weekday moved into
--     TEACHING_DAYS in the app; the enum keeps the part that is actually
--     invariant, which is what is being taught.
--
-- The rename is in place: every existing attendance row keeps its meaning
-- (a Monday register was always the tajweed one, a Thursday register the
-- hifdh one), and no row is rewritten. `alter type ... rename value` is
-- metadata only, so there is no table scan and no lock worth naming.
--
-- Numbered 0023, not 0022: two migrations named `ayah_scope_mistakes` were
-- applied to production on 27 Aug as 0021 and 0022, and neither was ever
-- committed to this repo. The ledger is keyed by filename so there was no
-- technical clash, but two different 0022s would have been a trap for whoever
-- read this next.
--
-- Every statement is idempotent so a half-applied batch can be re-run.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Faculty term dates ────────────────────────────────────────────────
--
-- The faculty dates, with one correction: Term 1 ends on Thursday 26 November
-- rather than the Wednesday, because the 26th is a lesson — that squares the
-- term at 8 tajweed and 8 hifdh for both sections. Term 2 still opens on a
-- Tuesday and so gets 5 hifdh sessions to 4 tajweed ones; the app counts
-- sessions rather than dividing the span by seven. exam_max is untouched.
update terms set starts_on = '2026-10-05', ends_on = '2026-11-26' where id = 1;
update terms set starts_on = '2027-01-05', ends_on = '2027-02-04' where id = 2;
update terms set starts_on = '2027-03-15', ends_on = '2027-05-20' where id = 3;

-- ── 2. Week unlock dates follow their term ───────────────────────────────
--
-- Weeks are the content calendar: `lessons` and `homeworks` hang off them, so
-- the ROWS must not be recreated or every lesson in the year is orphaned.
-- Only `unlock_at` moves, keeping the original rule — week N opens on the
-- Nth Monday from the start of its term — so nothing changes about which
-- week holds what, only about when it opens.
--
-- Without this, Term 3's content would still be pinned to the old 12 April
-- start and would not appear until four weeks into a term that now begins on
-- 15 March.
--
-- Anchored to the term's first MONDAY rather than to starts_on, because Term 2
-- opens on a Tuesday and a week that unlocks on a Tuesday matches no lesson.
with anchor as (
  select id as term_id,
         starts_on + ((1 - extract(isodow from starts_on)::int + 7) % 7) as first_monday
    from terms
)
update weeks w
   set unlock_at = (a.first_monday + (w.number - 1) * interval '7 days')::timestamptz
  from anchor a
 where a.term_id = w.term_id
   and w.unlock_at is distinct from (a.first_monday + (w.number - 1) * interval '7 days')::timestamptz;

-- ── 3. A session is a subject, not a weekday ─────────────────────────────
--
-- Guarded individually: `alter type ... rename value` has no IF EXISTS, and
-- re-running a half-applied batch must not fail on the half that landed.
do $$
begin
  if exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'session_t' and e.enumlabel = 'monday'
  ) then
    alter type session_t rename value 'monday' to 'tajweed';
  end if;

  if exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'session_t' and e.enumlabel = 'thursday'
  ) then
    alter type session_t rename value 'thursday' to 'hifdh';
  end if;
end $$;

comment on type session_t is
  'Which of the two weekly classes a register belongs to. The WEEKDAY is not '
  'part of this: tajweed is Monday for both sections, hifdh is Thursday for '
  'the brothers and Wednesday for the sisters. See TEACHING_DAYS in '
  'src/lib/attendance/calendar.ts.';

comment on table terms is
  'Faculty term dates for 2026/27. Kept in step by hand with TERMS in '
  'src/lib/attendance/calendar.ts, which is what the register and the '
  'calendar screens read.';
