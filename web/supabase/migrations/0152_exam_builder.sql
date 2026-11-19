-- 0152_exam_builder.sql
--
-- Exam Builder: a shared bank of past exam questions, and the papers teachers
-- build from it. Plan: docs/superpowers/plans/2026-11-19-exam-builder.md
--
-- NOT the same thing as `exam_scores` / `terms.exam_max` (a student's end-of-term
-- mark). Everything here is prefixed exam_bank_ / exam_paper to keep them apart.
--
-- Additive only: new tables, two functions, one private storage bucket. No
-- existing table is altered. Students can read none of it.
--
-- Rules the policies encode (owner's decisions, brainstorm 2026-11-19):
--   * every teacher can READ the bank and ADD a question to it;
--   * only an admin can change or remove a bank question;
--   * a paper belongs to the teacher who made it (admins see all);
--   * a question on a paper is a COPY, edited freely without touching the bank;
--   * "mark as final" stamps the paper's bank questions as used (EOT1 26/27).
--
-- Rollback: drop the five tables, the two functions and the bucket's policies.
-- Every statement idempotent.

-- ── admin check ────────────────────────────────────────────────────────────
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
     where id = public.acting_id() and role = 'teacher' and is_admin
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ── topics: a series you open, then the rules inside it ────────────────────
create table if not exists exam_bank_topics (
  id        text primary key,
  parent_id text references exam_bank_topics(id),
  title     text not null,
  position  int  not null
);

insert into exam_bank_topics (id, parent_id, title, position) values
  ('intro',              null,    'Introduction & foundations', 10),
  ('intro.tajweed',      'intro', 'Introduction to Tajweed', 11),
  ('intro.mistakes',     'intro', 'Mistakes (laḥn)', 12),
  ('noon',               null,    'Aḥkām Nūn Sākin & Tanwīn', 20),
  ('noon.ghunna',        'noon',  'Ghunna of Noon & Meem Mushaddah', 21),
  ('noon.idhaar',        'noon',  'Idhaar Halqy', 22),
  ('noon.idghaam',       'noon',  'Idghaam', 23),
  ('noon.iqlaab',        'noon',  'Iqlaab', 24),
  ('noon.ikhfaa',        'noon',  'Ikhfaa Haqiqy', 25),
  ('noon.general',       'noon',  'Across the rules', 26),
  ('meem',               null,    'Aḥkām Meem Sākin', 30),
  ('meem.ikhfaa',        'meem',  'Ikhfaa Shafawi', 31),
  ('meem.idghaam',       'meem',  'Idghaam Shafawi', 32),
  ('meem.idhaar',        'meem',  'Idhaar Shafawi', 33),
  ('meem.general',       'meem',  'Across the rules', 34),
  ('sifaat',             null,    'Sifaat', 40),
  ('sifaat.heavy',       'sifaat','Heavy letters', 41),
  ('sifaat.laam',        'sifaat','Laam', 42),
  ('sifaat.ra',          'sifaat','Ra', 43),
  ('sifaat.qalqala',     'sifaat','Qalqala', 44),
  ('sifaat.hams',        'sifaat','Hams', 45),
  ('sifaat.hamzatul-wasl','sifaat','Hamzatul Wasl', 46),
  ('sifaat.iltiqa',      'sifaat','Iltiqā'' Sākinayn', 47),
  ('sifaat.general',     'sifaat','Across the rules', 48),
  ('mudood',             null,    'Mudood', 50),
  ('mudood.overview',    'mudood','Overview & Madd Asli', 51),
  ('mudood.muttasil',    'mudood','Madd Muttasil', 52),
  ('mudood.munfasil',    'mudood','Madd Munfasil', 53),
  ('mudood.aarid',       'mudood','Madd ''Aarid & recitation speeds', 54),
  ('mudood.lazim',       'mudood','Madd Lazim', 55),
  ('mudood.general',     'mudood','Across the rules', 56),
  ('waqf',               null,    'Waqf wa Ibtida', 60),
  ('ummul-kitab',        null,    'Ummul Kitab', 70),
  ('adaab',              null,    'A''daab', 80),
  ('seerah',             null,    'Seerah', 90),
  ('matn',               null,    'Matn', 100)
on conflict (id) do update
  set parent_id = excluded.parent_id, title = excluded.title, position = excluded.position;

-- ── the bank ───────────────────────────────────────────────────────────────
create table if not exists exam_bank_questions (
  id            uuid primary key default gen_random_uuid(),
  topic_id      text not null references exam_bank_topics(id),
  kind          text not null check (kind in ('mcq', 'short')),
  prompt        text not null,
  -- Pictures of the Arabic, as paths in the exam-questions bucket, in order.
  prompt_images text[] not null default '{}',
  -- Or the Arabic typeset from quran_words instead of a picture:
  -- {"surah":103,"from_ayah":1,"to_ayah":3} (optional from_word/to_word).
  prompt_quran  jsonb,
  -- mcq only: [{"text":"…","image":"path or null","correct":true}]
  options       jsonb,
  select_many   boolean not null default false,
  -- The mark scheme for this question; null = no answer in the bank yet.
  answer        text,
  marks         numeric(4,1),
  -- Every place the question was found: [{"label":"EOT2 25/26","kind":"exam","number":"A12"}]
  sources       jsonb not null default '[]',
  -- Exams it has actually been set in, short codes: {"EOT2 25/26"}.
  used_in       text[] not null default '{}',
  -- 'check' = the import had to guess; 'clean' = unambiguous; 'approved' = an admin looked.
  review_status text not null default 'clean' check (review_status in ('clean', 'check', 'approved')),
  review_note   text,
  archived      boolean not null default false,
  -- Stable key from the import so a re-run updates rather than duplicates. Null for typed-in questions.
  import_key    text unique,
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now()
);
create index if not exists exam_bank_questions_topic on exam_bank_questions (topic_id) where not archived;

-- ── papers ─────────────────────────────────────────────────────────────────
create table if not exists exam_papers (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references profiles(id),
  -- Header, as printed: "End Of Term 1 Exam - Noon Sakin and Meem Sakin"
  title          text not null default 'End Of Term 1 Exam',
  date_label     text not null default '',      -- "November 2026"
  duration_label text not null default '',      -- "90 mins"
  -- The short stamp written onto bank questions when the paper is made final.
  code           text not null default 'EOT1',  -- EOT1 | EOT2 | EOY | …
  season         text not null default '26/27',
  notes          text[] not null default '{}',  -- the numbered "Note:" lines
  status         text not null default 'draft' check (status in ('draft', 'final')),
  finalised_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists exam_papers_owner on exam_papers (owner_id, updated_at desc);

create table if not exists exam_paper_sections (
  id        uuid primary key default gen_random_uuid(),
  paper_id  uuid not null references exam_papers(id) on delete cascade,
  position  int  not null,
  title     text not null,
  -- 'questions' holds items; 'practical' is the hifdh marking table.
  kind      text not null default 'questions' check (kind in ('questions', 'practical')),
  -- practical only: {"rows":3,"marks":9,"columns":["Verse","Surah","Order - before/after"]}
  practical jsonb
);
create index if not exists exam_paper_sections_paper on exam_paper_sections (paper_id, position);

create table if not exists exam_paper_items (
  id               uuid primary key default gen_random_uuid(),
  paper_id         uuid not null references exam_papers(id) on delete cascade,
  section_id       uuid not null references exam_paper_sections(id) on delete cascade,
  position         int  not null,
  -- Where the copy came from. Null for a question written straight onto the paper
  -- with "keep out of the bank", or if an admin later removes the bank row.
  bank_question_id uuid references exam_bank_questions(id) on delete set null,
  kind             text not null check (kind in ('mcq', 'short')),
  prompt           text not null,
  prompt_images    text[] not null default '{}',
  prompt_quran     jsonb,
  options          jsonb,
  select_many      boolean not null default false,
  answer           text,
  marks            numeric(4,1) not null default 1,
  -- Blank writing lines printed under a short-answer question.
  answer_lines     smallint not null default 3
);
create index if not exists exam_paper_items_section on exam_paper_items (section_id, position);
create index if not exists exam_paper_items_paper on exam_paper_items (paper_id);

-- ── row level security ─────────────────────────────────────────────────────
alter table exam_bank_topics    enable row level security;
alter table exam_bank_questions enable row level security;
alter table exam_papers         enable row level security;
alter table exam_paper_sections enable row level security;
alter table exam_paper_items    enable row level security;
revoke all on exam_bank_topics, exam_bank_questions, exam_papers, exam_paper_sections, exam_paper_items from anon;

drop policy if exists t_exam_bank_topics_read on exam_bank_topics;
create policy t_exam_bank_topics_read on exam_bank_topics for select using (is_teacher());

drop policy if exists t_exam_bank_read on exam_bank_questions;
create policy t_exam_bank_read on exam_bank_questions for select using (is_teacher());
drop policy if exists t_exam_bank_add on exam_bank_questions;
create policy t_exam_bank_add on exam_bank_questions for insert
  with check (is_teacher() and created_by = public.acting_id());
drop policy if exists t_exam_bank_admin_update on exam_bank_questions;
create policy t_exam_bank_admin_update on exam_bank_questions for update
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists t_exam_bank_admin_delete on exam_bank_questions;
create policy t_exam_bank_admin_delete on exam_bank_questions for delete using (public.is_admin());

create or replace function public.owns_exam_paper(p_paper uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from exam_papers p
     where p.id = p_paper and (p.owner_id = public.acting_id() or public.is_admin())
  );
$$;
revoke all on function public.owns_exam_paper(uuid) from public;
grant execute on function public.owns_exam_paper(uuid) to authenticated;

drop policy if exists t_exam_papers on exam_papers;
create policy t_exam_papers on exam_papers for all
  using (is_teacher() and (owner_id = public.acting_id() or public.is_admin()))
  with check (is_teacher() and (owner_id = public.acting_id() or public.is_admin()));

drop policy if exists t_exam_paper_sections on exam_paper_sections;
create policy t_exam_paper_sections on exam_paper_sections for all
  using (public.owns_exam_paper(paper_id)) with check (public.owns_exam_paper(paper_id));

drop policy if exists t_exam_paper_items on exam_paper_items;
create policy t_exam_paper_items on exam_paper_items for all
  using (public.owns_exam_paper(paper_id)) with check (public.owns_exam_paper(paper_id));

-- ── mark as final ──────────────────────────────────────────────────────────
-- A teacher may not update the bank, so the "used in" stamp goes through this
-- function: it checks the caller owns the paper, flips it to final, and adds
-- the paper's short label (code + season, e.g. "EOT1 26/27") to each bank
-- question the paper copied. Reopening removes the stamp again.
create or replace function public.exam_paper_set_final(p_paper uuid, p_final boolean) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_label text;
begin
  if not public.owns_exam_paper(p_paper) then
    raise exception 'Not your paper.';
  end if;
  select trim(code) || ' ' || trim(season) into v_label from exam_papers where id = p_paper;
  if v_label is null or trim(v_label) = '' then
    raise exception 'The paper needs a code and a season first.';
  end if;

  if p_final then
    update exam_papers set status = 'final', finalised_at = now(), updated_at = now() where id = p_paper;
    update exam_bank_questions q
       set used_in = array_append(q.used_in, v_label)
     where q.id in (select i.bank_question_id from exam_paper_items i
                     where i.paper_id = p_paper and i.bank_question_id is not null)
       and not (v_label = any (q.used_in));
  else
    update exam_papers set status = 'draft', finalised_at = null, updated_at = now() where id = p_paper;
    -- Only lift the stamp where no OTHER final paper with the same label still uses the question.
    update exam_bank_questions q
       set used_in = array_remove(q.used_in, v_label)
     where q.id in (select i.bank_question_id from exam_paper_items i
                     where i.paper_id = p_paper and i.bank_question_id is not null)
       and not exists (
             select 1 from exam_paper_items i2
               join exam_papers p2 on p2.id = i2.paper_id
              where i2.bank_question_id = q.id and p2.id <> p_paper and p2.status = 'final'
                and trim(p2.code) || ' ' || trim(p2.season) = v_label);
  end if;
  return v_label;
end $$;
revoke all on function public.exam_paper_set_final(uuid, boolean) from public;
grant execute on function public.exam_paper_set_final(uuid, boolean) to authenticated;

-- ── pictures of the Arabic ─────────────────────────────────────────────────
-- Private bucket. Paths: bank/<file> for imported pictures, new/<profile id>/<file>
-- for ones a teacher uploads with a new question. Read server-side through
-- short-lived signed URLs. No update/delete for teachers: bank pictures are
-- as fixed as the bank itself (the import and admin fixes use the service role).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exam-questions', 'exam-questions', false, 3 * 1024 * 1024,
        array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types, public = excluded.public;

drop policy if exists exq_teacher_read on storage.objects;
create policy exq_teacher_read on storage.objects for select to authenticated
  using (bucket_id = 'exam-questions' and public.is_teacher());
drop policy if exists exq_teacher_insert on storage.objects;
create policy exq_teacher_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'exam-questions' and public.is_teacher()
              and (storage.foldername(name))[1] = 'new');
