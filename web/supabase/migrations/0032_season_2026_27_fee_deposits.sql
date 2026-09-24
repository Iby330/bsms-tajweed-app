-- The 2026/27 season, and application fees landing in the deposit tracker.
--
-- 1. A FRESH SEASON. Until now there was one season, labelled 2025/26, and the
--    2026/27 terms had been hung on it. Its £310 of deposits are last year's
--    money, already spent or carried: what is left of it is the £1.62 now
--    typed in as this season's opening balance. Keeping those deposits in the
--    current season would count them twice, so 2026/27 is its own row and
--    2025/26 simply stops being the one the tracker shows. Nothing of last
--    year's roster is deleted.
--
-- 2. LAST YEAR'S COSTS GO. They were exported, before this ran, to
--    ~/Documents/BSMS Finance Archive/2025-26/ — outside the app on purpose —
--    and are deleted here. The audit trigger keeps a before-image of each row.
--
-- 3. "FEE RECEIVED" IS A DEPOSIT. Ticking it on an application puts that
--    applicant on this season's roster with the fee as their deposit;
--    unticking it takes the payment back off. A trigger rather than the server
--    action, for the same reason the strike counters are one (0015): it holds
--    however the tick was written.
--
-- Every statement is idempotent so a half-applied batch can be re-run.

-- ── 1. The season ────────────────────────────────────────────────────────
-- Un-flag first: seasons_one_current allows exactly one current row.
update seasons set is_current = false where is_current and label <> '2026/27';

insert into seasons (label, starts_on, ends_on, deposit_amount, opening_balance, is_current)
values ('2026/27', '2026-09-19', '2027-09-17', 15.00, 1.62, true)
on conflict (label) do nothing;

-- The three terms already dated October 2026 onwards are this season's.
update terms
   set season_id = (select id from seasons where label = '2026/27')
 where starts_on >= '2026-09-19';

-- ── 2. Last year's costs ─────────────────────────────────────────────────
delete from expenses
 where season_id = (select id from seasons where label = '2025/26');

-- ── 3. Fee received → deposit ────────────────────────────────────────────
-- Which application an entry came from, so unticking finds the right row and
-- ticking twice cannot add a second one.
alter table deposit_entries
  add column if not exists application_id uuid references applications(id) on delete set null;

create unique index if not exists deposit_entries_application
  on deposit_entries (application_id) where application_id is not null;

create or replace function record_fee_deposit(a applications) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season bigint;
  v_entry  uuid;
  v_student uuid;
begin
  select id into v_entry from deposit_entries where application_id = a.id;

  if v_entry is null then
    select id into v_season from seasons where is_current;
    if v_season is null then return; end if;

    -- Link the account if there is one, unless that student is already on
    -- this season's roster by hand — the one-per-student index would refuse it.
    if a.profile_id is not null and not exists (
      select 1 from deposit_entries where season_id = v_season and student_id = a.profile_id
    ) then
      v_student := a.profile_id;
    end if;

    insert into deposit_entries (season_id, application_id, student_id, full_name, section)
    values (v_season, a.id, v_student, trim(a.first_name || ' ' || a.surname), a.section)
    returning id into v_entry;
  end if;

  -- The fee on the application, not a constant: it is what they were asked to pay.
  if a.fee_pence > 0 and not exists (
    select 1 from deposit_payments where entry_id = v_entry and kind = 'deposit'
  ) then
    insert into deposit_payments (entry_id, amount, kind, note, recorded_by)
    values (v_entry, a.fee_pence / 100.0, 'deposit', 'Application fee', auth.uid());
  end if;
end $$;

create or replace function remove_fee_deposit(p_application uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry uuid;
begin
  select id into v_entry from deposit_entries where application_id = p_application;
  if v_entry is null then return; end if;

  delete from deposit_payments where entry_id = v_entry and kind = 'deposit';

  -- The row goes too, unless something has been written on it since: a
  -- re-entry, a strike or a note is a record worth keeping.
  delete from deposit_entries e
   where e.id = v_entry
     and e.term1_strikes = 0 and e.term2_strikes = 0 and e.term3_strikes = 0
     and e.notes is null
     and not exists (select 1 from deposit_payments p where p.entry_id = e.id);
end $$;

create or replace function sync_fee_to_deposits() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.fee_settled and (tg_op = 'INSERT' or not old.fee_settled) then
    perform record_fee_deposit(new);
  elsif tg_op = 'UPDATE' and old.fee_settled and not new.fee_settled then
    perform remove_fee_deposit(new.id);
  end if;

  -- Send login gives an applicant an account after the fact; the roster row
  -- follows it, with the same guard against a hand-made entry for them.
  if tg_op = 'UPDATE' and new.profile_id is distinct from old.profile_id
     and new.profile_id is not null then
    update deposit_entries e
       set student_id = new.profile_id
     where e.application_id = new.id
       and not exists (
         select 1 from deposit_entries o
          where o.season_id = e.season_id and o.student_id = new.profile_id
       );
  end if;
  return null;
end $$;

revoke execute on function record_fee_deposit(applications) from public, anon, authenticated;
revoke execute on function remove_fee_deposit(uuid)         from public, anon, authenticated;
revoke execute on function sync_fee_to_deposits()           from public, anon, authenticated;

drop trigger if exists fee_to_deposits on applications;
create trigger fee_to_deposits
  after insert or update of fee_settled, profile_id on applications
  for each row execute function sync_fee_to_deposits();

-- Fees already ticked before this existed. record_fee_deposit is a no-op for
-- anyone already on the roster, so re-running adds nothing.
select record_fee_deposit(a) from applications a where a.fee_settled;
