-- ═══════════════════════════════════════════════════════════════════════
-- Groups 3 and 4 get their real classes: Masjid Al-Umawi and Masjid Quba.
--
-- Abdallah Ghouse and Ibrahim Ramadan have led groups 3 and 4 since the
-- levelling was set, but had no brothers' class to hold them, so their
-- curriculum was attached to their demo cohorts — "Demo — Abdallah" and
-- "Demo — Ibrahim". lib/curriculum/syllabus.ts has carried a note since it was
-- written to move those entries "as soon as those classes exist". They exist
-- now, and this is that move.
--
-- WHAT HAPPENS TO THE DEMO STUDENTS. The two classes hold seven invented
-- accounts (@bsms-demo.test). They do NOT come along: promoting the class to
-- `brothers` with them still in it would put Adam Whitfield and six others
-- into the brothers' leaderboards and onto real registers beside the sixteen
-- real students. They move to a new demo class instead, which keeps them
-- working — Adam is the account the app is demonstrated with — while leaving
-- the real classes empty and ready for students placed after the recitation
-- sessions.
--
-- THE CLASS ROWS ARE RENAMED, NOT REPLACED. Their ids are what
-- `class_courses` keys the syllabus off (0026), what `profiles.class_id`
-- points at, and what attendance hangs off. Creating new rows and deleting the
-- old ones would drop both teachers' curriculum on the floor.
--
-- THE TEACHERS FOLLOW THEIR CLASS. `profiles.section` is what scopes a
-- teacher's class picker (`teacherClasses` filters on it), so a teacher left
-- in `demo` while teaching a `brothers` class would be offered the demo
-- classes and not their own. Both are moved with the class they teach.
--
-- Every statement is idempotent so a half-applied batch can be re-run.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Somewhere for the demo students to go ─────────────────────────────
--
-- Deliberately has no teacher. Its two had one each and both have just moved
-- to a real class, and `profiles.section` now scopes them to `brothers`, so
-- neither would see this in their picker anyway. The students are what matter
-- here: they keep a class, so every screen that assumes one still works. Give
-- it to a demo-section teacher whenever somebody wants to drive it.
insert into classes (name, section)
select 'Demo — Brothers', 'demo'
 where not exists (select 1 from classes where name = 'Demo — Brothers');

-- ── 2. Move them out BEFORE the classes change section ───────────────────
--
-- Ordered first on purpose: once the rename has run there is no way left to
-- tell which students were the demo cohort and which were placed there for
-- real. Students only — the teachers stay put and are handled in step 4.
update profiles p
   set class_id = (select id from classes where name = 'Demo — Brothers')
  from classes c
 where c.id = p.class_id
   and p.role = 'student'
   and c.name in ('Demo — Abdallah', 'Demo — Ibrahim');

-- ── 3. The classes themselves ────────────────────────────────────────────
update classes set name = 'Masjid Al-Umawi', section = 'brothers'
 where name = 'Demo — Abdallah';
update classes set name = 'Masjid Quba', section = 'brothers'
 where name = 'Demo — Ibrahim';

-- ── 4. The teachers follow ───────────────────────────────────────────────
--
-- Matched through `profiles.class_id` rather than by name: there are two
-- profiles called "Ibrahim Ramadan" — one on ibyramadan@icloud.com teaching
-- the class, and a second, class-less one already in `brothers`. Only the one
-- actually holding the class should move.
update profiles p
   set section = 'brothers'
  from classes c
 where c.id = p.class_id
   and p.role = 'teacher'
   and c.name in ('Masjid Al-Umawi', 'Masjid Quba');
