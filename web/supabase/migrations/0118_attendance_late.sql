-- A student who comes in late is present, and the register can now say so.
-- `late` rides on a present row only: late is a way of being present, never
-- an absence, so it carries no reason and no strike, and every count of
-- attendance that reads `present` keeps counting them as there.
alter table attendance add column if not exists late boolean not null default false;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'attendance_late_is_present') then
    alter table attendance add constraint attendance_late_is_present check (not late or present);
  end if;
end $$;
