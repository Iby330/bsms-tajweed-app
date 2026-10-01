-- ═══════════════════════════════════════════════════════════════════════
-- Notes on an applicant, one per teacher per thought, signed and dated.
--
-- Until now `applications.notes` was a single shared text box: two teachers
-- writing about the same applicant overwrote each other, and nothing said
-- who had written what. This is a thread instead. Every teacher reads every
-- note; a teacher can only post as themselves and only delete their own.
--
-- The old column is copied in as unsigned notes and then left alone rather
-- than dropped, so nothing written before this migration can be lost.
--
-- Every statement is idempotent so a half-applied batch can be re-run.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists application_notes (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  -- Null only for notes carried over from the old shared box, which were
  -- never signed. Set null rather than cascade so removing a teacher's
  -- account does not take their notes on applicants with it.
  author_id uuid references profiles(id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists application_notes_application_idx
  on application_notes (application_id, created_at);

alter table application_notes enable row level security;

drop policy if exists t_application_notes_read on application_notes;
create policy t_application_notes_read on application_notes
  for select using (is_teacher());

drop policy if exists t_application_notes_insert on application_notes;
create policy t_application_notes_insert on application_notes
  for insert with check (is_teacher() and author_id = auth.uid());

drop policy if exists t_application_notes_delete on application_notes;
create policy t_application_notes_delete on application_notes
  for delete using (is_teacher() and author_id = auth.uid());

-- Carry the old shared notes across once. The not-exists guard keeps a
-- re-run from copying them twice.
insert into application_notes (application_id, author_id, body, created_at)
select a.id, null, left(btrim(a.notes), 2000), coalesce(a.reviewed_at, a.created_at)
from applications a
where nullif(btrim(a.notes), '') is not null
  and not exists (
    select 1 from application_notes n
    where n.application_id = a.id and n.author_id is null
  )
returning application_id;

comment on column applications.notes is
  'Superseded by application_notes (migration 0040). Copied there unsigned; '
  'no longer written by the app.';
