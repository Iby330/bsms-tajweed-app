-- ═══════════════════════════════════════════════════════════════════════
-- Term 2 starts on Monday 4 January, not Tuesday the 5th.
--
-- A one-day correction with more reach than it looks, because the 4th is a
-- MONDAY and the 5th was a Tuesday:
--
--   · The brothers gain a tajweed session. Term 2 held 5 hifdh against only
--     4 tajweed while it opened mid-week; it is now 5 and 5. The sisters gain
--     a hifdh session for the same reason, and are 5 and 5 too.
--   · Every Term 2 week moves back seven days. `weeks.unlock_at` was aligned
--     in 0023 to "the term's first Monday plus seven days per week", and the
--     first Monday is now the 4th rather than the 11th.
--
-- The week shift is what makes this a migration rather than a one-line edit
-- to lib/attendance/calendar.ts. Since 0026, a class's content opens relative
-- to the first week of the term it takes the course in, so these dates now
-- drive the syllabus scheduling as well as the register — moving the term
-- without moving the weeks would leave Term 2's content opening a week after
-- the term it belongs to had started.
--
-- Week ROWS are not recreated, only re-dated: lessons and homeworks hang off
-- them, and recreating a week would orphan its content.
--
-- Side effect worth recording: Term 2 week 5 now unlocks on 1 February, which
-- is INSIDE the term for the first time. Weeks 6-8 still open after it closes
-- on 4 February — that is the known content-does-not-fit-the-terms problem
-- (Ṣifāt is 7 lessons against 5 teaching Mondays) and is a matter for the
-- faculty, not something this migration should paper over.
--
-- Idempotent: both statements set absolute values, so re-running is a no-op.
-- ═══════════════════════════════════════════════════════════════════════

update terms set starts_on = '2027-01-04' where id = 2;

-- Re-anchored the same way 0023 did it — the term's first Monday plus 7n —
-- so the rule stays the one rule rather than becoming a list of dates. With
-- starts_on now falling ON a Monday the anchor is the term's own start date.
with anchor as (
  select id as term_id,
         starts_on + ((1 - extract(isodow from starts_on)::int + 7) % 7) as first_monday
    from terms
   where id = 2
)
update weeks w
   set unlock_at = (a.first_monday + (w.number - 1) * interval '7 days')::timestamptz
  from anchor a
 where a.term_id = w.term_id;
