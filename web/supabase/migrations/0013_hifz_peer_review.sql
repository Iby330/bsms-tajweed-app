-- ═══════════════════════════════════════════════════════════════════════
-- Hifz peer review: seeded Qur'an words + pairs / sessions / mistakes.
-- Spec: docs/superpowers/specs/2026-08-14-hifz-peer-review-design.md
-- Every statement idempotent so a half-applied batch can be re-run.
-- ═══════════════════════════════════════════════════════════════════════

-- Word-by-word Uthmani text with Madani mushaf layout. Seeded by
-- execution/seed_quran_words.ts (chapters 72–114, the memorisation run);
-- the app only ever reads it.
create table if not exists quran_words (
  surah_number  int  not null references surahs(number),
  ayah_number   int  not null,
  word_position int  not null,             -- 1-based within the ayah
  text_uthmani  text not null,
  is_end        boolean not null default false,  -- ayah-end marker "word"
  page_number   int  not null,             -- 1..604
  line_number   int  not null,             -- 1..15 within the page
  primary key (surah_number, ayah_number, word_position)
);

create table if not exists revision_pairs (
  id          uuid primary key default gen_random_uuid(),
  student_a   uuid not null references profiles(id),
  student_b   uuid not null references profiles(id),
  assigned_by uuid references profiles(id),
  assigned_at timestamptz not null default now(),
  active      boolean not null default true,
  check (student_a <> student_b)
);
-- Best-effort "one active pair per student" (the assign action retires both
-- students' pairs first; these catch same-column duplicates).
create unique index if not exists uq_revision_pairs_active_a on revision_pairs(student_a) where active;
create unique index if not exists uq_revision_pairs_active_b on revision_pairs(student_b) where active;

create table if not exists revision_sessions (
  id           uuid primary key default gen_random_uuid(),
  reciter_id   uuid not null references profiles(id),
  reviewer_id  uuid not null references profiles(id),
  started_at   timestamptz not null default now(),
  submitted_at timestamptz,                -- null = draft, invisible to reciter
  overall_note text,
  flags        text[] not null default '{}',
  check (reciter_id <> reviewer_id)
);
create index if not exists idx_revision_sessions_reciter  on revision_sessions(reciter_id);
create index if not exists idx_revision_sessions_reviewer on revision_sessions(reviewer_id);

create table if not exists revision_mistakes (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references revision_sessions(id) on delete cascade,
  surah_number  int  not null,
  ayah_number   int  not null,
  word_position int  not null,
  category      text not null check (category in ('hifz','tajweed','makhraj','fluency')),
  detail        text,                      -- rule slug or letter; null = uncategorised
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_revision_mistakes_session on revision_mistakes(session_id);

-- ═══════════ RLS ═══════════
alter table quran_words       enable row level security;
alter table revision_pairs    enable row level security;
alter table revision_sessions enable row level security;
alter table revision_mistakes enable row level security;

-- Reference text: readable by anyone signed in (same as surahs).
drop policy if exists s_quran_words_read on quran_words;
create policy s_quran_words_read on quran_words for select using (auth.uid() is not null);

-- Pairs: teachers manage, members read.
drop policy if exists t_revision_pairs on revision_pairs;
create policy t_revision_pairs on revision_pairs for all
  using (is_teacher()) with check (is_teacher());
drop policy if exists s_pairs_member_read on revision_pairs;
create policy s_pairs_member_read on revision_pairs for select
  using (auth.uid() = student_a or auth.uid() = student_b);

-- Sessions: teacher READ ONLY by design (they view, never edit).
drop policy if exists t_sessions_read on revision_sessions;
create policy t_sessions_read on revision_sessions for select using (is_teacher());
drop policy if exists s_sessions_reviewer_read on revision_sessions;
create policy s_sessions_reviewer_read on revision_sessions for select
  using (reviewer_id = auth.uid());
drop policy if exists s_sessions_reciter_read on revision_sessions;
create policy s_sessions_reciter_read on revision_sessions for select
  using (reciter_id = auth.uid() and submitted_at is not null);
drop policy if exists s_sessions_insert on revision_sessions;
create policy s_sessions_insert on revision_sessions for insert
  with check (
    reviewer_id = auth.uid()
    and exists (
      select 1 from revision_pairs p
      where p.active
        and ((p.student_a = reviewer_id and p.student_b = reciter_id)
          or (p.student_b = reviewer_id and p.student_a = reciter_id))
    )
  );
drop policy if exists s_sessions_update on revision_sessions;
create policy s_sessions_update on revision_sessions for update
  using (reviewer_id = auth.uid()) with check (reviewer_id = auth.uid());

-- Mistakes: reviewer writes ONLY while the session is a draft; reads split
-- per audience. Teacher read-only.
drop policy if exists t_mistakes_read on revision_mistakes;
create policy t_mistakes_read on revision_mistakes for select using (is_teacher());
drop policy if exists s_mistakes_reviewer_read on revision_mistakes;
create policy s_mistakes_reviewer_read on revision_mistakes for select
  using (exists (select 1 from revision_sessions s
                 where s.id = session_id and s.reviewer_id = auth.uid()));
drop policy if exists s_mistakes_reviewer_insert on revision_mistakes;
create policy s_mistakes_reviewer_insert on revision_mistakes for insert
  with check (exists (select 1 from revision_sessions s
                      where s.id = session_id and s.reviewer_id = auth.uid()
                        and s.submitted_at is null));
drop policy if exists s_mistakes_reviewer_delete on revision_mistakes;
create policy s_mistakes_reviewer_delete on revision_mistakes for delete
  using (exists (select 1 from revision_sessions s
                 where s.id = session_id and s.reviewer_id = auth.uid()
                   and s.submitted_at is null));
drop policy if exists s_mistakes_reciter_read on revision_mistakes;
create policy s_mistakes_reciter_read on revision_mistakes for select
  using (exists (select 1 from revision_sessions s
                 where s.id = session_id and s.reciter_id = auth.uid()
                   and s.submitted_at is not null));
