-- ═══════════════════════════════════════════════════════════════════════
-- Shift the PLACEHOLDER calendar so "today" sits inside Term 1.
--
-- The real faculty dates aren't published yet (brainstorm Q15). With the
-- original placeholder (Term 1 starting Oct 2026) nothing is unlocked, so the
-- app correctly shows an empty year — accurate, but impossible to demo.
--
-- This shifts every date by a single interval so Term 1 week 1 began three
-- weeks ago. When the real dates arrive, UPDATE terms/weeks (and re-derive
-- homeworks.due_at the same way) — it is data entry, not a code change.
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  shift interval;
begin
  -- align Term 1 week 1 to the Monday three weeks before today
  select (date_trunc('week', current_date) - interval '3 weeks') - starts_on::timestamp
    into shift
  from terms where id = 1;

  update terms set
    starts_on = starts_on + shift,
    ends_on   = ends_on   + shift;

  update weeks set unlock_at = unlock_at + shift;

  -- due_at is stored, not derived — keep it in step with its week
  update homeworks set due_at = due_at + shift where due_at is not null;

  -- demo activity: keep submissions and hifz dates consistent with the shift
  update submissions set
    submitted_at = submitted_at + shift,
    approved_at  = approved_at  + shift
  where submitted_at is not null;

  update hifz_records set passed_at = passed_at + shift;
  update attendance    set session_date = session_date + shift;
  update strikes       set issued_at = issued_at + shift;
end $$;
