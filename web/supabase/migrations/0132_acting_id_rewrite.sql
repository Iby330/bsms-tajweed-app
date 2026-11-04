-- Every public rule, view and function that asks "who is signed in" now asks
-- "who is this request acting as". Reads the live catalog as it applies, so a
-- recent migration from another session can't be overwritten by stale text.
--
-- Left on auth.uid() on purpose: storage policies (avatars belong to the login,
-- seats record no voice notes yet) and the finance functions (the log records
-- the real person). acting_id() itself is built on auth.uid().
do $$
declare
  r record;
  remaining int;
begin
  for r in
    select * from pg_policies
     where schemaname = 'public'
       and coalesce(qual, '') || coalesce(with_check, '') like '%auth.uid()%'
  loop
    execute format('alter policy %I on %I.%I %s %s', r.policyname, r.schemaname, r.tablename,
      case when r.qual is null then '' else 'using (' || replace(r.qual, 'auth.uid()', 'public.acting_id()') || ')' end,
      case when r.with_check is null then '' else 'with check (' || replace(r.with_check, 'auth.uid()', 'public.acting_id()') || ')' end);
  end loop;

  for r in
    select c.relname, c.reloptions, rtrim(pg_get_viewdef(c.oid), ';') as def
      from pg_class c
     where c.relkind = 'v' and c.relnamespace = 'public'::regnamespace
       and pg_get_viewdef(c.oid) like '%auth.uid()%'
  loop
    -- OR REPLACE resets reloptions unless they are restated.
    execute format('create or replace view public.%I %s as %s', r.relname,
      case when r.reloptions is null then '' else 'with (' || array_to_string(r.reloptions, ',') || ')' end,
      replace(r.def, 'auth.uid()', 'public.acting_id()'));
  end loop;

  for r in
    select p.oid from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.prosrc like '%auth.uid()%'
       and p.proname not in ('acting_id', 'log_finance_change', 'record_fee_deposit')
  loop
    execute replace(pg_get_functiondef(r.oid), 'auth.uid()', 'public.acting_id()');
  end loop;

  select count(*) into remaining from pg_policies
   where schemaname = 'public' and coalesce(qual, '') || coalesce(with_check, '') like '%auth.uid()%';
  if remaining > 0 then raise exception 'rewrite left % policies on auth.uid()', remaining; end if;
end $$;
