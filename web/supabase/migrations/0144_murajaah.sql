-- Murāja'ah: timed revision for the Esteemed Ustadhs class.
-- Spec: docs/superpowers/specs/2026-11-10-murajaah-design.md
--
-- New tables and functions only: nothing that exists today is altered, and
-- revision_sessions / revision_mistakes stay as they are for the programme.
-- Every rule reads public.acting_id(), never auth.uid(), because the ustadhs
-- act through seats (0131).
--
-- The clock is the server's. The app role may not write timer_started_at,
-- running_since, elapsed_ms, finished_at or submitted_at at all (column
-- grants below); they change only inside murajaah_clock() and
-- murajaah_submit(), which use now().
--
-- Rollback: drop the five tables and the five functions (nothing else
-- depends on them):
--   drop table if exists murajaah_target_overrides, murajaah_targets,
--     murajaah_checkpoints, murajaah_marks, murajaah_sessions;
--   drop function if exists public.murajaah_clock(uuid, text),
--     public.murajaah_submit(uuid, text), public.teaches_class(uuid),
--     public.class_student(uuid, uuid), public.murajaah_portion_ok(text, int[]);
--
-- Every statement idempotent.

-- ── Helpers ─────────────────────────────────────────────────────────────

-- The caller (as acting_id()) is the teacher of this class: classes.teacher_id
-- is the source of truth (0133 names Mohamed there). Deliberately NOT
-- is_teacher(): every other teacher must stay out of this class.
create or replace function public.teaches_class(p_class uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from classes c
     where c.id = p_class and c.teacher_id = public.acting_id()
  );
$$;
revoke all on function public.teaches_class(uuid) from public;
grant execute on function public.teaches_class(uuid) to authenticated;

-- An active student of this class. Definer, because a student can read only
-- their own profile row.
create or replace function public.class_student(p_profile uuid, p_class uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
     where p.id = p_profile and p.class_id = p_class
       and p.role = 'student' and p.is_active
  );
$$;
revoke all on function public.class_student(uuid, uuid) from public;
grant execute on function public.class_student(uuid, uuid) to authenticated;

-- A portion is one kind and a sorted, duplicate-free, non-empty list of unit
-- numbers in range: hizb 1-60, juz 1-30, surah 1-114.
create or replace function public.murajaah_portion_ok(p_kind text, p_ns int[])
returns boolean
language sql immutable set search_path = public as $$
  select coalesce(cardinality(p_ns), 0) > 0
     and array_position(p_ns, null) is null
     and p_ns = array(select distinct x from unnest(p_ns) x order by x)
     and (select min(x) from unnest(p_ns) x) >= 1
     and (select max(x) from unnest(p_ns) x) <= case p_kind
           when 'hizb' then 60 when 'juz' then 30 when 'surah' then 114 else 0 end;
$$;

-- ── Tables ──────────────────────────────────────────────────────────────

create table if not exists murajaah_sessions (
  id               uuid primary key default gen_random_uuid(),
  class_id         uuid not null references classes(id),
  listener_id      uuid not null references profiles(id),
  reciter_id       uuid not null references profiles(id),
  portion_kind     text not null check (portion_kind in ('hizb', 'juz', 'surah')),
  portion_ns       int[] not null,
  portion_label    text not null check (length(portion_label) between 1 and 200),
  hizb_eq          numeric(6,2) not null check (hizb_eq > 0),
  mistake_limit    int not null check (mistake_limit >= 0),
  band_minutes     jsonb not null check (band_minutes ?& array['ideal', 'good', 'acceptable']),
  created_at       timestamptz not null default now(),
  timer_started_at timestamptz,
  running_since    timestamptz,
  elapsed_ms       int not null default 0 check (elapsed_ms >= 0),
  finished_at      timestamptz,
  submitted_at     timestamptz,
  note             text check (note is null or length(note) <= 2000),
  check (listener_id <> reciter_id),
  check (public.murajaah_portion_ok(portion_kind, portion_ns)),
  check (submitted_at is null or finished_at is not null),
  check (finished_at is null or running_since is null)
);
comment on table murajaah_sessions is
  'One timed revision in the ustadhs class: a listener times a classmate reciting a portion. submitted_at null = draft.';

-- One open draft per listener at a time.
create unique index if not exists murajaah_sessions_one_draft
  on murajaah_sessions (listener_id) where submitted_at is null;
create index if not exists murajaah_sessions_reciter on murajaah_sessions (reciter_id, submitted_at desc);
create index if not exists murajaah_sessions_class on murajaah_sessions (class_id, submitted_at desc);

create table if not exists murajaah_marks (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references murajaah_sessions(id) on delete cascade,
  at_ms         int not null check (at_ms >= 0),
  surah_number  int,
  ayah_number   int,
  word_position int,          -- null with a surah/ayah = the whole ayah; all null = a +1 counter mark
  category      text check (category is null or category in ('hifz', 'tajweed', 'makhraj', 'fluency')),
  created_at    timestamptz not null default now(),
  check ((surah_number is null) = (ayah_number is null)),
  check (word_position is null or surah_number is not null),
  check (not (category = 'makhraj' and word_position is null and surah_number is not null))
);
comment on table murajaah_marks is
  'A mistake in a murajaah session: a +1 counter mark (no location), a word, or a whole ayah.';
create index if not exists murajaah_marks_session on murajaah_marks (session_id);

create table if not exists murajaah_checkpoints (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references murajaah_sessions(id) on delete cascade,
  kind       text not null check (kind in ('auto', 'added')),
  ord        int not null check (ord >= 1),   -- auto: 1-based index in the automatic list; added: 1000+n
  label      text not null check (length(label) between 1 and 200),
  at_ms      int not null check (at_ms >= 0),
  created_at timestamptz not null default now(),
  check ((kind = 'auto') = (ord < 1000))
);
comment on table murajaah_checkpoints is
  'A ticked checkpoint in a murajaah session, at_ms on the session clock.';
create unique index if not exists murajaah_checkpoints_ord on murajaah_checkpoints (session_id, ord);

create table if not exists murajaah_targets (
  class_id       uuid primary key references classes(id),
  ideal_min      numeric(5,2) not null default 10 check (ideal_min > 0),
  good_min       numeric(5,2) not null default 15,
  acceptable_min numeric(5,2) not null default 20,
  limit_hizb     int not null default 3 check (limit_hizb >= 0),
  limit_juz      int not null default 5 check (limit_juz >= 0),
  limit_surah10  int not null default 3 check (limit_surah10 >= 0),
  updated_by     uuid references profiles(id),
  updated_at     timestamptz not null default now(),
  check (ideal_min <= good_min and good_min <= acceptable_min)
);
comment on table murajaah_targets is
  'A class''s murajaah targets: band minutes per hizb and mistake limits. No row = the defaults.';

create table if not exists murajaah_target_overrides (
  student_id    uuid primary key references profiles(id),
  class_id      uuid not null references classes(id),
  limit_hizb    int check (limit_hizb >= 0),
  limit_juz     int check (limit_juz >= 0),
  limit_surah10 int check (limit_surah10 >= 0),
  note          text check (note is null or length(note) <= 500),
  updated_by    uuid references profiles(id),
  updated_at    timestamptz not null default now()
);
comment on table murajaah_target_overrides is
  'A student''s own mistake limits; a null column uses the class value.';
create index if not exists murajaah_target_overrides_class on murajaah_target_overrides (class_id);

alter table murajaah_sessions enable row level security;
alter table murajaah_marks enable row level security;
alter table murajaah_checkpoints enable row level security;
alter table murajaah_targets enable row level security;
alter table murajaah_target_overrides enable row level security;

-- ── Grants ──────────────────────────────────────────────────────────────
-- anon gets nothing. authenticated may not UPDATE a session at all (the
-- functions below do it) and may only change a mark's category.
revoke all on murajaah_sessions, murajaah_marks, murajaah_checkpoints,
              murajaah_targets, murajaah_target_overrides from anon;
revoke update on murajaah_sessions from authenticated;
revoke update on murajaah_marks from authenticated;
grant update (category) on murajaah_marks to authenticated;
revoke update on murajaah_checkpoints from authenticated;

-- ── Sessions ────────────────────────────────────────────────────────────

drop policy if exists mj_sessions_read on murajaah_sessions;
create policy mj_sessions_read on murajaah_sessions for select using (
  listener_id = public.acting_id()
  or (reciter_id = public.acting_id() and submitted_at is not null)
  or public.teaches_class(class_id)
);

-- A listener opens a draft on a classmate, in their own class, with the
-- clock untouched.
drop policy if exists mj_sessions_insert on murajaah_sessions;
create policy mj_sessions_insert on murajaah_sessions for insert with check (
  listener_id = public.acting_id()
  and public.class_student(listener_id, class_id)
  and public.can_listen_freely(listener_id, reciter_id)
  and timer_started_at is null and running_since is null and elapsed_ms = 0
  and finished_at is null and submitted_at is null
);

drop policy if exists mj_sessions_delete on murajaah_sessions;
create policy mj_sessions_delete on murajaah_sessions for delete using (
  listener_id = public.acting_id() and submitted_at is null
);

-- ── Marks and checkpoints: follow the session ───────────────────────────
-- Read: the subquery runs under the caller's session rules, so a mark is
-- visible exactly when its session is.

drop policy if exists mj_marks_read on murajaah_marks;
create policy mj_marks_read on murajaah_marks for select using (
  exists (select 1 from murajaah_sessions s where s.id = session_id)
);
drop policy if exists mj_marks_insert on murajaah_marks;
create policy mj_marks_insert on murajaah_marks for insert with check (
  exists (select 1 from murajaah_sessions s
           where s.id = session_id and s.listener_id = public.acting_id() and s.submitted_at is null)
);
drop policy if exists mj_marks_update on murajaah_marks;
create policy mj_marks_update on murajaah_marks for update using (
  exists (select 1 from murajaah_sessions s
           where s.id = session_id and s.listener_id = public.acting_id() and s.submitted_at is null)
) with check (
  exists (select 1 from murajaah_sessions s
           where s.id = session_id and s.listener_id = public.acting_id() and s.submitted_at is null)
);
drop policy if exists mj_marks_delete on murajaah_marks;
create policy mj_marks_delete on murajaah_marks for delete using (
  exists (select 1 from murajaah_sessions s
           where s.id = session_id and s.listener_id = public.acting_id() and s.submitted_at is null)
);

drop policy if exists mj_checkpoints_read on murajaah_checkpoints;
create policy mj_checkpoints_read on murajaah_checkpoints for select using (
  exists (select 1 from murajaah_sessions s where s.id = session_id)
);
drop policy if exists mj_checkpoints_insert on murajaah_checkpoints;
create policy mj_checkpoints_insert on murajaah_checkpoints for insert with check (
  exists (select 1 from murajaah_sessions s
           where s.id = session_id and s.listener_id = public.acting_id() and s.submitted_at is null)
);
drop policy if exists mj_checkpoints_delete on murajaah_checkpoints;
create policy mj_checkpoints_delete on murajaah_checkpoints for delete using (
  exists (select 1 from murajaah_sessions s
           where s.id = session_id and s.listener_id = public.acting_id() and s.submitted_at is null)
);

-- ── Targets and overrides ───────────────────────────────────────────────
-- Read by the class's students (a listener snapshots the reciter's limit)
-- and its teacher; written by its teacher only.

drop policy if exists mj_targets_read on murajaah_targets;
create policy mj_targets_read on murajaah_targets for select using (
  public.teaches_class(class_id) or public.class_student(public.acting_id(), class_id)
);
drop policy if exists mj_targets_write on murajaah_targets;
create policy mj_targets_write on murajaah_targets for all
  using (public.teaches_class(class_id))
  with check (public.teaches_class(class_id));

drop policy if exists mj_overrides_read on murajaah_target_overrides;
create policy mj_overrides_read on murajaah_target_overrides for select using (
  public.teaches_class(class_id) or public.class_student(public.acting_id(), class_id)
);
drop policy if exists mj_overrides_write on murajaah_target_overrides;
create policy mj_overrides_write on murajaah_target_overrides for all
  using (public.teaches_class(class_id))
  with check (public.teaches_class(class_id) and public.class_student(student_id, class_id));

-- ── The clock ───────────────────────────────────────────────────────────
-- p_op: 'start' (first Start; also resumes), 'pause', 'resume', 'finish'.
-- Only the listener of a draft that is not finished. Pause and Finish fold
-- the running span into elapsed_ms. Repeating an op is a no-op (a double tap
-- or a retried request is harmless). Returns the clock with the server's
-- now(), so the client can correct for its own clock.
create or replace function public.murajaah_clock(p_session uuid, p_op text)
returns table (
  elapsed_ms int, running_since timestamptz, timer_started_at timestamptz,
  finished_at timestamptz, server_now timestamptz
)
language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
declare
  s murajaah_sessions%rowtype;
  t timestamptz := now();
  span int;
begin
  if p_op not in ('start', 'pause', 'resume', 'finish') then
    raise exception 'unknown clock op %', p_op using errcode = '22023';
  end if;

  select * into s from murajaah_sessions m
   where m.id = p_session and m.listener_id = public.acting_id() and m.submitted_at is null
   for update;
  if not found then
    raise exception 'no draft of yours with that id' using errcode = '42501';
  end if;
  if s.finished_at is not null then
    raise exception 'this session is finished' using errcode = '22023';
  end if;

  span := case when s.running_since is null then 0
               else greatest(0, floor(extract(epoch from (t - s.running_since)) * 1000))::int end;

  if p_op in ('start', 'resume') then
    if p_op = 'resume' and s.timer_started_at is null then
      raise exception 'the clock has not started' using errcode = '22023';
    end if;
    if s.running_since is null then
      update murajaah_sessions m
         set running_since = t, timer_started_at = coalesce(m.timer_started_at, t)
       where m.id = p_session;
    end if;
  elsif p_op = 'pause' then
    if s.running_since is not null then
      update murajaah_sessions m
         set elapsed_ms = m.elapsed_ms + span, running_since = null
       where m.id = p_session;
    end if;
  else -- finish
    if s.timer_started_at is null then
      raise exception 'the clock has not started' using errcode = '22023';
    end if;
    update murajaah_sessions m
       set elapsed_ms = m.elapsed_ms + span, running_since = null, finished_at = t
     where m.id = p_session;
  end if;

  return query
    select m.elapsed_ms, m.running_since, m.timer_started_at, m.finished_at, t
      from murajaah_sessions m where m.id = p_session;
end $$;
revoke all on function public.murajaah_clock(uuid, text) from public;
grant execute on function public.murajaah_clock(uuid, text) to authenticated;

-- Save a finished draft, with its note. Returns submitted_at.
create or replace function public.murajaah_submit(p_session uuid, p_note text)
returns timestamptz
language plpgsql volatile security definer set search_path = public as $$
declare
  t timestamptz := now();
begin
  update murajaah_sessions m
     set submitted_at = t, note = nullif(btrim(coalesce(p_note, '')), '')
   where m.id = p_session and m.listener_id = public.acting_id()
     and m.submitted_at is null and m.finished_at is not null;
  if not found then
    raise exception 'no finished draft of yours with that id' using errcode = '42501';
  end if;
  return t;
end $$;
revoke all on function public.murajaah_submit(uuid, text) from public;
grant execute on function public.murajaah_submit(uuid, text) to authenticated;
