-- One login, two roles. A seat is a profile row with no auth user of its own,
-- owned through login_id. acting_id() says which row a request acts as. With
-- no x-bsms-seat header it IS auth.uid(), so nothing changes for anyone else.
-- Kill switch: redefine acting_id() as `select auth.uid()`.
-- Spec: docs/superpowers/specs/2026-11-04-esteemed-ustadhs-design.md

alter table profiles add column if not exists login_id uuid unique references auth.users(id) on delete cascade;
comment on column profiles.login_id is
  'Set on a seat only: the login that may act as this row. Null on normal profiles.';

-- A seat's id has no auth.users row. Normal profiles keep their old cascade
-- through the trigger below.
alter table profiles drop constraint if exists profiles_id_fkey;

create or replace function public.delete_profile_with_login() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.profiles where id = old.id;
  return old;
end $$;
drop trigger if exists delete_profile_with_login on auth.users;
create trigger delete_profile_with_login after delete on auth.users
  for each row execute function public.delete_profile_with_login();

-- login_id is what acting_id() trusts, so no app role may ever write it.
create or replace function public.guard_login_id() returns trigger
language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon')
     and (tg_op = 'INSERT' and new.login_id is not null
          or tg_op = 'UPDATE' and new.login_id is distinct from old.login_id) then
    raise exception 'login_id cannot be changed from the app';
  end if;
  return new;
end $$;
drop trigger if exists guard_login_id on profiles;
create trigger guard_login_id before insert or update on profiles
  for each row execute function public.guard_login_id();

-- A seat shows the same name and picture as its owner.
create or replace function public.sync_seat_identity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set full_name = new.full_name, avatar_url = new.avatar_url
   where login_id = new.id;
  return null;
end $$;
drop trigger if exists sync_seat_identity on profiles;
create trigger sync_seat_identity after update of full_name, avatar_url on profiles
  for each row execute function public.sync_seat_identity();

create or replace function public.acting_id() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  headers text := current_setting('request.headers', true);
  seat uuid;
begin
  -- The common path: no seat named, so no JSON parse and no table read.
  if headers is null or position('x-bsms-seat' in headers) = 0 then
    return auth.uid();
  end if;
  select p.id into seat from public.profiles p
   where p.id::text = headers::json->>'x-bsms-seat' and p.login_id = auth.uid();
  return coalesce(seat, auth.uid());
end $$;
revoke all on function public.acting_id() from public;
grant execute on function public.acting_id() to authenticated, anon, service_role;

-- The programme-wide boards treated "not demo" as "the programme". A walled-off
-- viewer sees only their own cohort; everyone else sees the two real ones.
create or replace view v_lb_individual_all as
 SELECT p.full_name, c.name AS class_name, p.section,
    round(avg(hp.pct), 2) AS pct,
    rank() OVER (ORDER BY (avg(hp.pct)) DESC) AS rank
   FROM v_hw_pct_all hp
     JOIN profiles p ON p.id = hp.student_id AND p.is_active AND NOT p.hidden_from_students
     JOIN classes c ON c.id = p.class_id
  WHERE CASE
          WHEN ((SELECT profiles.section FROM profiles WHERE profiles.id = auth.uid()) IN ('demo'::section_t, 'ustadhs'::section_t))
            THEN p.section = (SELECT profiles.section FROM profiles WHERE profiles.id = auth.uid())
          ELSE p.section IN ('brothers'::section_t, 'sisters'::section_t)
        END
  GROUP BY p.id, p.full_name, c.name, p.section;

create or replace view v_lb_hifz_class_all as
 SELECT c.name AS class_name, c.section,
    round(avg(h.pct), 2) AS pct,
    rank() OVER (ORDER BY (avg(h.pct)) DESC) AS rank
   FROM v_hifz_progress_all h
     JOIN profiles p ON p.id = h.student_id AND p.is_active AND NOT p.hidden_from_students
     JOIN classes c ON c.id = p.class_id
  WHERE CASE
          WHEN ((SELECT profiles.section FROM profiles WHERE profiles.id = auth.uid()) IN ('demo'::section_t, 'ustadhs'::section_t))
            THEN c.section = (SELECT profiles.section FROM profiles WHERE profiles.id = auth.uid())
          ELSE c.section IN ('brothers'::section_t, 'sisters'::section_t)
        END
  GROUP BY c.id, c.name, c.section;
