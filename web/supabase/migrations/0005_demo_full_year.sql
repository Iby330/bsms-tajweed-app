-- ═══════════════════════════════════════════════════════════════════════
-- Demo calendar, second pass: put "today" near the END of the year so the
-- FULL curriculum is browsable (all 21 Tajweed modules, Umm al-Kitāb, TFP)
-- while a handful of weeks stay locked — the weekly-release mechanic is still
-- visible rather than being asserted.
--
-- Supersedes 0004. Still placeholder dates: when the faculty calendar lands,
-- UPDATE terms/weeks/homeworks.due_at and this becomes irrelevant.
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  shift interval;
  target_week timestamptz;
begin
  -- aim: the 22nd of 26 weeks unlocked this Monday → 4 weeks still to come
  select unlock_at into target_week
  from (
    select unlock_at, row_number() over (order by term_id, number) as n
    from weeks
  ) w where n = 22;

  shift := (date_trunc('week', now()) - target_week);

  update terms set starts_on = starts_on + shift, ends_on = ends_on + shift;
  update weeks set unlock_at = unlock_at + shift;
  update homeworks set due_at = due_at + shift where due_at is not null;

  update submissions
     set submitted_at = submitted_at + shift,
         approved_at  = approved_at + shift
   where submitted_at is not null;

  update hifz_records set passed_at    = passed_at + shift;
  update attendance    set session_date = session_date + shift;
  update strikes       set issued_at    = issued_at + shift;
end $$;
