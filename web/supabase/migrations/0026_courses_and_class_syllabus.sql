-- ═══════════════════════════════════════════════════════════════════════
-- A course becomes a first-class thing, and a class gets its own syllabus.
--
-- THE PROBLEM. Until now a course was not stored anywhere: it was implied by
-- "the tajweed lessons hanging off Term 3's weeks". That worked only while
-- every class moved through one calendar together. It stopped working the
-- moment the programme split into levelled groups, because the same course is
-- now taught in different terms to different classes — group 1 takes Mudūd in
-- Term 1 while groups 2–4 take it in Term 3 — and a lesson cannot be in two
-- terms at once.
--
-- The visible symptom is the homework tab: every class is shown every
-- homework in the programme, so Masjid Al-Aqsa, who are doing Qāʿidah
-- Nūrāniyyah, are offered eight Ghunna homeworks they are not studying.
--
-- WHAT CHANGES. Three additions, all of them additive:
--
--   1. `courses` — the eight courses the programme teaches, named at last.
--   2. `lessons.course_id` / `homeworks.course_id` + `ordinal` — which course
--      an item belongs to, and its place in that course.
--   3. `class_courses` — the syllabus: which courses a class takes, and in
--      which term. This is `SYLLABUS` and `CLASS_GROUP` from
--      lib/curriculum/syllabus.ts, moved into the database, because RLS is
--      what has to enforce visibility and RLS cannot read a TypeScript file.
--
-- WHAT DOES NOT CHANGE, and must not:
--
--   · No lesson or homework row is created, deleted or re-parented. 1,117
--     submissions and 3,488 answers reference these rows from last year's
--     marks; re-filing them would orphan a year of student work.
--   · `weeks` keeps its job. It is still the teaching calendar the register
--     and both calendar screens run on, and it is still where a term's dates
--     come from. What it stops being is the sole answer to "has this opened".
--   · RLS is untouched HERE. This migration changes no visibility at all —
--     it only records facts. The policy rewrite is 0027, once the app can
--     read these tables, so that a half-deployed state cannot lock students
--     out of content they can see today.
--
-- Every statement is idempotent so a half-applied batch can be re-run.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. The courses ───────────────────────────────────────────────────────
--
-- `key` matches CourseKey in lib/curriculum/syllabus.ts one for one, and is
-- the join between the two. Three of these have no content in the app at all
-- yet (Ṣifāt (new), Makhārij, Qāʿidah Nūrāniyyah); they are listed anyway so
-- a class's term can name what it is being taught even while there is
-- nothing to link to. A course with no lessons is not an error.
create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  /** Display order when a term holds more than one. */
  position int not null default 0
);

insert into courses (key, label, position) values
  ('ghunna',      'Ghunna',              1),
  ('sifaat_old',  'Ṣifāt',               2),
  ('sifaat_new',  'Ṣifāt (new)',         3),
  ('mudood',      'Mudūd',               4),
  ('makharij',    'Makhārij',            5),
  ('mabadi',      'Mabādi''',            6),
  ('ummul_kitab', 'Umm al-Kitāb',        7),
  ('qaidah',      'Qāʿidah Nūrāniyyah',  8)
on conflict (key) do update set label = excluded.label, position = excluded.position;

comment on table courses is
  'The courses the programme teaches. `key` matches CourseKey in '
  'lib/curriculum/syllabus.ts. A course with no lessons is normal — it is '
  'named so a class can be told what it is studying before content exists.';

-- ── 2. Which course each lesson and homework belongs to ──────────────────
alter table lessons   add column if not exists course_id uuid references courses(id);
alter table lessons   add column if not exists ordinal int;
alter table homeworks add column if not exists course_id uuid references courses(id);
alter table homeworks add column if not exists ordinal int;

-- The mapping is exact rather than a guess: every (series, term) pair in the
-- data today holds precisely one course, verified against the live rows —
-- tajweed/T1 is Ghunna (8), umm_al_kitab/T1 is Umm al-Kitāb (9), tajweed/T2
-- is Ṣifāt (7), tajweed/T3 is Mudūd (6), tfp/T3 is Mabādi' (7).
update lessons l
   set course_id = c.id
  from weeks w, courses c
 where w.id = l.week_id
   and l.course_id is null
   and c.key = case
         when l.series = 'tajweed'       and w.term_id = 1 then 'ghunna'
         when l.series = 'tajweed'       and w.term_id = 2 then 'sifaat_old'
         when l.series = 'tajweed'       and w.term_id = 3 then 'mudood'
         when l.series = 'tfp'           and w.term_id = 3 then 'mabadi'
         when l.series = 'umm_al_kitab'  and w.term_id = 1 then 'ummul_kitab'
       end;

update homeworks h
   set course_id = c.id
  from weeks w, courses c
 where w.id = h.week_id
   and h.course_id is null
   and c.key = case
         when h.series = 'tajweed'       and w.term_id = 1 then 'ghunna'
         when h.series = 'tajweed'       and w.term_id = 2 then 'sifaat_old'
         when h.series = 'tajweed'       and w.term_id = 3 then 'mudood'
         when h.series = 'tfp'           and w.term_id = 3 then 'mabadi'
         when h.series = 'umm_al_kitab'  and w.term_id = 1 then 'ummul_kitab'
       end;

-- ORDINAL — an item's place within its course, counting from 1.
--
-- It is the week NUMBER, not a new sequence, and that is exact rather than
-- convenient: courses inside a term run in parallel, one item per teaching
-- week, and every course's items were verified to sit in weeks 1..n with no
-- gaps. So "Mudūd item 3" is "the one in week 3 of whichever term the class
-- takes Mudūd in", which is precisely what makes the same course re-datable
-- for a different class.
update lessons   l set ordinal = w.number from weeks w where w.id = l.week_id and l.ordinal is null;
update homeworks h set ordinal = w.number from weeks w where w.id = h.week_id and h.ordinal is null;

comment on column lessons.ordinal is
  'Place within the course, from 1. Equals the week number, because courses '
  'in a term run in parallel at one item per teaching week.';
comment on column homeworks.ordinal is
  'Place within the course, from 1. See lessons.ordinal.';

create index if not exists lessons_course_idx   on lessons (course_id, ordinal);
create index if not exists homeworks_course_idx on homeworks (course_id, ordinal);

-- ── 3. The syllabus ──────────────────────────────────────────────────────
--
-- Which courses a class takes, and when. A class with NO rows here has no
-- syllabus, which is a meaningful state rather than a gap: the sisters' four
-- classes and the two unassigned demo classes are deliberately absent, and
-- 0027's policies fall back to the old whole-programme visibility for them so
-- that nothing they can see today disappears.
create table if not exists class_courses (
  class_id uuid not null references classes(id) on delete cascade,
  course_id uuid not null references courses(id),
  term_id int not null references terms(id),
  /** Order within the term, for display only — courses run in parallel. */
  position int not null default 0,
  primary key (class_id, course_id)
);

comment on table class_courses is
  'The per-class syllabus: which courses a class takes and in which term. '
  'Mirrors SYLLABUS/CLASS_GROUP in lib/curriculum/syllabus.ts. A class with '
  'no rows here falls back to seeing the whole programme.';

-- Seeded from lib/curriculum/syllabus.ts as of 2026-09-13. Keyed by class
-- NAME (unique in the schema) and course KEY so the seed reads like the
-- source it came from and a missing class is a no-op rather than a bad row.
--
-- Group 1 Masjid An-Nabawi · 2 Masjid Al-Haram · 3 Demo — Abdallah
-- Group 4 Demo — Ibrahim   · 5 Masjid Al-Aqsa
--
-- Group 5 has no Term 3 ("TBC based on how students progress") and group 4 no
-- Mabādi' ("maybe"); both are left out rather than guessed at, because a topic
-- shown and then withdrawn is worse than one added later.
insert into class_courses (class_id, course_id, term_id, position)
select cl.id, co.id, v.term_id, v.position
  from (values
    ('Masjid An-Nabawi', 'ghunna',      1, 1),
    ('Masjid An-Nabawi', 'mudood',      1, 2),
    ('Masjid An-Nabawi', 'sifaat_new',  2, 1),
    ('Masjid An-Nabawi', 'makharij',    3, 1),
    ('Masjid An-Nabawi', 'mabadi',      3, 2),

    ('Masjid Al-Haram',  'ghunna',      1, 1),
    ('Masjid Al-Haram',  'ummul_kitab', 1, 2),
    ('Masjid Al-Haram',  'sifaat_old',  2, 1),
    ('Masjid Al-Haram',  'mudood',      3, 1),
    ('Masjid Al-Haram',  'mabadi',      3, 2),

    ('Demo — Abdallah',  'ghunna',      1, 1),
    ('Demo — Abdallah',  'ummul_kitab', 1, 2),
    ('Demo — Abdallah',  'sifaat_old',  2, 1),
    ('Demo — Abdallah',  'mudood',      3, 1),
    ('Demo — Abdallah',  'mabadi',      3, 2),

    ('Demo — Ibrahim',   'ghunna',      1, 1),
    ('Demo — Ibrahim',   'ummul_kitab', 1, 2),
    ('Demo — Ibrahim',   'sifaat_old',  2, 1),
    ('Demo — Ibrahim',   'mudood',      3, 1),

    ('Masjid Al-Aqsa',   'qaidah',      1, 1),
    ('Masjid Al-Aqsa',   'ummul_kitab', 2, 1)
  ) as v(class_name, course_key, term_id, position)
  join classes cl on cl.name = v.class_name
  join courses co on co.key  = v.course_key
on conflict (class_id, course_id) do update
  set term_id = excluded.term_id, position = excluded.position;

-- ── 4. When an item opens for a class ────────────────────────────────────
--
-- The whole point of the migration, in one function: an item's unlock date is
-- read off the term THE CLASS TAKES THE COURSE IN, not the term the row
-- happens to be filed under.
--
-- The arithmetic is the same one that generated `weeks.unlock_at` in 0023 —
-- the term's first Monday plus seven days per week — so a class following the
-- default calendar gets exactly the dates it gets today, and group 1's Mudūd
-- moves to Term 1 without any row being touched.
--
-- It deliberately does NOT clamp to the end of the term. Some courses are
-- longer than the term they are set in (Umm al-Kitāb is 9 items against Term
-- 2's 8 weeks for group 5), and the honest result is a date after the term
-- ends rather than several items silently sharing the last week. That
-- mismatch is a content problem for the faculty to settle, and it is better
-- visible than hidden.
--
-- STABLE, not IMMUTABLE: it reads tables. `now()` is deliberately NOT in
-- here — the caller compares against it — so the function is about the
-- calendar alone.
create or replace function class_item_unlock_at(
  p_class uuid, p_course uuid, p_ordinal int
) returns timestamptz
language sql stable security definer set search_path = public as $$
  select (select min(w.unlock_at) from weeks w where w.term_id = cc.term_id)
         + ((greatest(p_ordinal, 1) - 1) * interval '7 days')
    from class_courses cc
   where cc.class_id = p_class
     and cc.course_id = p_course;
$$;

comment on function class_item_unlock_at(uuid, uuid, int) is
  'When item `p_ordinal` of a course opens for a class, derived from the term '
  'that class takes the course in. Returns NULL when the class does not take '
  'the course at all — callers must treat NULL as "not visible".';

-- Read by the RLS policies in 0027, which run as the querying user.
grant execute on function class_item_unlock_at(uuid, uuid, int) to authenticated, anon;
