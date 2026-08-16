-- Deposit tracker and season finances.
--
-- Modelled on the "Deposit Tracker" sheet of the Tajweed Master Spreadsheet,
-- with three deliberate departures from how the sheet does it:
--
--  1. The roster is NOT `profiles`. The sheet lists everyone from the first
--     lesson onwards — waiting list, no-shows, drop-outs, people who declined
--     a place. Most never become app users and shouldn't be given accounts to
--     make the books balance. So `deposit_entries` carries its own name, with
--     an OPTIONAL link to a profile for those who do have one.
--
--  2. Re-entry 1..4 become rows, not columns. A student who is knocked out on
--     three strikes and buys back in pays another deposit; the sheet gave that
--     four columns and stopped. Rows have no ceiling, make the total a sum
--     rather than a formula, and let the price change year to year without
--     rewriting history — last year's £10 rows stay £10.
--
--  3. There is a season. "Left over profit from previous year" only means
--     something if years exist as records, so `seasons` carries the opening
--     balance and this year's deposit price, and terms now belong to one.
--
-- Access is every teacher, read and write, matching the existing is_teacher()
-- policies — with the finance tables audited, because a mistyped deletion of a
-- £224 prize line should not be silent.

-- ---------------------------------------------------------------- seasons

create table if not exists seasons (
  id              bigint generated always as identity primary key,
  label           text not null unique,                  -- '2025/26'
  starts_on       date not null,
  ends_on         date not null,
  -- What a deposit costs this year. Read when recording a payment, never used
  -- to re-price payments already taken.
  deposit_amount  numeric(10,2) not null default 10.00 check (deposit_amount >= 0),
  -- Carried forward from the previous season's left-over.
  opening_balance numeric(10,2) not null default 0,
  is_current      boolean not null default false,
  created_at      timestamptz not null default now(),
  constraint seasons_dates_ordered check (ends_on > starts_on)
);

-- Exactly one current season, enforced by the database rather than by whoever
-- remembers to untick the old one.
create unique index if not exists seasons_one_current
  on seasons (is_current) where is_current;

-- Terms belong to a season, and carry their position within it. The trigger
-- below maps a strike to term 1/2/3 by this number, not by terms.id — next
-- year's terms get fresh ids but are still numbered 1, 2, 3.
alter table terms add column if not exists season_id bigint references seasons(id) on delete set null;
alter table terms add column if not exists number smallint;

create index if not exists terms_season_id_idx on terms (season_id);

-- ------------------------------------------------------- roster + payments

create table if not exists deposit_entries (
  id            uuid primary key default gen_random_uuid(),
  season_id     bigint not null references seasons(id) on delete cascade,
  -- Null for anyone without an app account: the waiting list, the person who
  -- never made it to lesson one, the drop-out from before accounts existed.
  student_id    uuid references profiles(id) on delete set null,
  full_name     text not null,
  section       section_t not null,
  -- The sheet's Y/N column: are they still in the programme.
  still_in      boolean not null default true,
  term1_strikes smallint not null default 0 check (term1_strikes >= 0),
  term2_strikes smallint not null default 0 check (term2_strikes >= 0),
  term3_strikes smallint not null default 0 check (term3_strikes >= 0),
  notes         text,
  created_at    timestamptz not null default now()
);

-- One entry per student per season. Nulls don't collide in a unique index, so
-- unlinked entries are unaffected by this.
create unique index if not exists deposit_entries_season_student
  on deposit_entries (season_id, student_id) where student_id is not null;

create index if not exists deposit_entries_season_id_idx  on deposit_entries (season_id);
create index if not exists deposit_entries_student_id_idx on deposit_entries (student_id);

create table if not exists deposit_payments (
  id          uuid primary key default gen_random_uuid(),
  entry_id    uuid not null references deposit_entries(id) on delete cascade,
  amount      numeric(10,2) not null check (amount > 0),
  paid_on     date not null default current_date,
  -- 'deposit' is the first one; every buy-back after three strikes is a re_entry.
  kind        text not null default 'deposit' check (kind in ('deposit', 're_entry')),
  note        text,
  recorded_by uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists deposit_payments_entry_id_idx    on deposit_payments (entry_id);
create index if not exists deposit_payments_recorded_by_idx on deposit_payments (recorded_by);

-- ------------------------------------------------------------------ costs

create table if not exists expenses (
  id           uuid primary key default gen_random_uuid(),
  season_id    bigint not null references seasons(id) on delete cascade,
  description  text not null,
  category     text not null default 'other'
                 check (category in ('gifts','prizes','speakers','catering',
                                     'supplies','decor','travel','other')),
  amount       numeric(10,2) not null check (amount >= 0),
  -- Who fronted the money. The sheet's "Reimbursed?" column held a name; that
  -- is really two facts, so they are split: who paid, and whether they have
  -- been paid back yet.
  paid_by      uuid references profiles(id) on delete set null,
  paid_by_name text,
  reimbursed   boolean not null default false,
  incurred_on  date not null default current_date,
  note         text,
  created_at   timestamptz not null default now()
);

create index if not exists expenses_season_id_idx on expenses (season_id);
create index if not exists expenses_paid_by_idx   on expenses (paid_by);

-- ------------------------------------------------------------------ audit

create table if not exists finance_audit (
  id         bigint generated always as identity primary key,
  table_name text not null,
  row_id     text not null,
  action     text not null check (action in ('insert','update','delete')),
  actor_id   uuid,
  before     jsonb,
  after      jsonb,
  at         timestamptz not null default now()
);

create index if not exists finance_audit_at_idx    on finance_audit (at desc);
create index if not exists finance_audit_row_idx   on finance_audit (table_name, row_id);
create index if not exists finance_audit_actor_idx on finance_audit (actor_id);

create or replace function log_finance_change() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into finance_audit (table_name, row_id, action, actor_id, before, after)
  values (
    tg_table_name,
    coalesce((case when tg_op = 'DELETE' then old.id else new.id end)::text, '?'),
    lower(tg_op),
    auth.uid(),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- SECURITY DEFINER in a schema the API exposes is callable by anon and
-- authenticated unless the grant is taken away. It is only ever meant to run
-- from the triggers below.
revoke execute on function log_finance_change() from public, anon, authenticated;

drop trigger if exists audit_deposit_entries  on deposit_entries;
drop trigger if exists audit_deposit_payments on deposit_payments;
drop trigger if exists audit_expenses         on expenses;
drop trigger if exists audit_seasons          on seasons;

create trigger audit_deposit_entries  after insert or update or delete on deposit_entries
  for each row execute function log_finance_change();
create trigger audit_deposit_payments after insert or update or delete on deposit_payments
  for each row execute function log_finance_change();
create trigger audit_expenses         after insert or update or delete on expenses
  for each row execute function log_finance_change();
-- seasons too, and it is the one that matters most: the deposit price and the
-- carry-over are the only figures on the whole screen that are typed rather
-- than summed, so an unexplained change to either moves every total under it.
create trigger audit_seasons          after insert or update or delete on seasons
  for each row execute function log_finance_change();

-- --------------------------------------------------- strikes → the tracker

-- The counters stay hand-editable — they are the historical record for people
-- who predate the app — but issuing a strike in the app keeps them honest.
-- This lives in a trigger rather than in the server action so it holds however
-- the strike was written: the UI, a script, or SQL run by hand.
create or replace function apply_deposit_strike_delta(
  p_student uuid, p_term integer, p_delta integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t record;
begin
  select season_id, number into t from terms where id = p_term;
  -- A term with no season or no number can't be mapped to a column; leave the
  -- counters alone rather than guess.
  if t.number is null or t.season_id is null then return; end if;

  update deposit_entries e
     set term1_strikes = greatest(0, e.term1_strikes + case when t.number = 1 then p_delta else 0 end),
         term2_strikes = greatest(0, e.term2_strikes + case when t.number = 2 then p_delta else 0 end),
         term3_strikes = greatest(0, e.term3_strikes + case when t.number = 3 then p_delta else 0 end)
   where e.student_id = p_student
     and e.season_id  = t.season_id;
end $$;

revoke execute on function apply_deposit_strike_delta(uuid, integer, integer)
  from public, anon, authenticated;

create or replace function sync_deposit_strikes() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform apply_deposit_strike_delta(new.student_id, new.term_id, 1);
  elsif tg_op = 'DELETE' then
    perform apply_deposit_strike_delta(old.student_id, old.term_id, -1);
  elsif old.student_id is distinct from new.student_id
     or old.term_id    is distinct from new.term_id then
    -- Moved to another student or another term: take it off the old row before
    -- putting it on the new one, or the total quietly gains a strike.
    perform apply_deposit_strike_delta(old.student_id, old.term_id, -1);
    perform apply_deposit_strike_delta(new.student_id, new.term_id, 1);
  end if;
  return null;
end $$;

revoke execute on function sync_deposit_strikes() from public, anon, authenticated;

drop trigger if exists sync_strikes_to_tracker on strikes;
create trigger sync_strikes_to_tracker
  after insert or update or delete on strikes
  for each row execute function sync_deposit_strikes();

-- ------------------------------------------------------------------ views

-- security_invoker so RLS is applied as the caller, not the view's owner. The
-- older v_* views in this database predate that and run as owner.
create or replace view v_deposit_entry_totals with (security_invoker = true) as
  select e.id                        as entry_id,
         coalesce(sum(p.amount), 0)  as total,
         count(p.id)                 as payment_count,
         count(p.id) filter (where p.kind = 're_entry') as re_entries,
         -- What they actually paid first, not what a deposit costs today. The
         -- price belongs to the season and can change mid-year; showing this
         -- year's price against last term's payment would be a lie.
         (select p2.amount from deposit_payments p2
           where p2.entry_id = e.id
           order by p2.paid_on, p2.created_at limit 1) as first_amount
    from deposit_entries e
    left join deposit_payments p on p.entry_id = e.id
   group by e.id;

create or replace view v_season_finance with (security_invoker = true) as
  select s.id                                   as season_id,
         s.label,
         s.opening_balance,
         coalesce(d.deposits, 0)                as deposits,
         s.opening_balance + coalesce(d.deposits, 0) as gross_income,
         coalesce(c.costs, 0)                   as costs,
         s.opening_balance + coalesce(d.deposits, 0) - coalesce(c.costs, 0) as left_over
    from seasons s
    left join (
      select e.season_id, sum(p.amount) as deposits
        from deposit_payments p
        join deposit_entries e on e.id = p.entry_id
       group by e.season_id
    ) d on d.season_id = s.id
    left join (
      select season_id, sum(amount) as costs from expenses group by season_id
    ) c on c.season_id = s.id;

-- -------------------------------------------------------------------- RLS

alter table seasons          enable row level security;
alter table deposit_entries  enable row level security;
alter table deposit_payments enable row level security;
alter table expenses         enable row level security;
alter table finance_audit    enable row level security;

drop policy if exists t_seasons          on seasons;
drop policy if exists t_deposit_entries  on deposit_entries;
drop policy if exists t_deposit_payments on deposit_payments;
drop policy if exists t_expenses         on expenses;
drop policy if exists t_finance_audit_read   on finance_audit;
drop policy if exists t_finance_audit_insert on finance_audit;

-- is_teacher() wrapped in a select so it is evaluated once per statement
-- rather than once per row. Students get no policy at all here: none of this
-- is theirs to see.
create policy t_seasons          on seasons          for all to authenticated
  using ((select is_teacher())) with check ((select is_teacher()));
create policy t_deposit_entries  on deposit_entries  for all to authenticated
  using ((select is_teacher())) with check ((select is_teacher()));
create policy t_deposit_payments on deposit_payments for all to authenticated
  using ((select is_teacher())) with check ((select is_teacher()));
create policy t_expenses         on expenses         for all to authenticated
  using ((select is_teacher())) with check ((select is_teacher()));

-- The log is append-only from the application's side: readable and writable,
-- never editable or erasable, or it would not be worth keeping.
create policy t_finance_audit_read   on finance_audit for select to authenticated
  using ((select is_teacher()));
create policy t_finance_audit_insert on finance_audit for insert to authenticated
  with check ((select is_teacher()));

-- ------------------------------------------------------- seed the seasons

-- The three terms already in the database are last year's; give them a season
-- and their position in it so the strike trigger can map them.
insert into seasons (label, starts_on, ends_on, deposit_amount, opening_balance, is_current)
select '2025/26', min(starts_on), max(ends_on), 10.00, 0, false from terms
where not exists (select 1 from seasons where label = '2025/26');

update terms t
   set season_id = (select id from seasons where label = '2025/26'),
       number    = sub.n
  from (select id, row_number() over (order by starts_on) as n from terms) sub
 where sub.id = t.id and t.season_id is null;
