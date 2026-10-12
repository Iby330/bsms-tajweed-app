-- The two test students leave Masjid Quba, and their homework goes.
--
-- The programme lead's call, 2026-10-12: Adam Whitfield (adam.w@bsms-demo.test)
-- and Bilal Osei (bilal.o@bsms-demo.test) come off the Masjid Quba register
-- and their homework is undone, but the accounts stay live so they can be
-- used to test again. They move to `Demo: Brothers` (section demo, no real
-- students, no teacher) rather than to no class, so they still log in to a
-- working student page. Both keep `hidden_from_students`, so no leaderboard
-- shows them.
--
-- Only their homework goes: submissions, with the answers, voice notes and
-- attempts that cascade from them, and any homework extensions. Their hifz
-- records, attendance and peer-revision pairing are left as they are. To put
-- one back in a class for a test, set `profiles.class_id` by hand.
--
-- Nothing is dropped unread. The rows are copied into `archive` first
-- (*_demo_removed_2026_10_12, not exposed by PostgREST). The voice note's
-- audio file stays in storage; only its row goes.

create temp table demo_two as
select p.id from profiles p join auth.users u on u.id = p.id
where u.email in ('adam.w@bsms-demo.test', 'bilal.o@bsms-demo.test');

create temp table demo_two_submissions as
select id from submissions where student_id in (select id from demo_two);

-- ── archive ─────────────────────────────────────────────────────────────

create table if not exists archive.submissions_demo_removed_2026_10_12 as
select * from submissions where id in (select id from demo_two_submissions);
create table if not exists archive.answers_demo_removed_2026_10_12 as
select * from answers where submission_id in (select id from demo_two_submissions);
create table if not exists archive.voice_notes_demo_removed_2026_10_12 as
select * from voice_notes where submission_id in (select id from demo_two_submissions);
create table if not exists archive.submission_attempts_demo_removed_2026_10_12 as
select * from submission_attempts
where submission_id in (select id from demo_two_submissions)
   or student_id in (select id from demo_two);

-- ── remove the homework ─────────────────────────────────────────────────

delete from submission_attempts where student_id in (select id from demo_two);
delete from submissions where id in (select id from demo_two_submissions);  -- answers, notes, attempts cascade
delete from homework_extensions where student_id in (select id from demo_two);

-- ── out of Masjid Quba, into the empty demo class ───────────────────────

update profiles
set class_id = (select id from classes where name = 'Demo: Brothers' and section = 'demo'),
    hidden_from_students = true
where id in (select id from demo_two)
returning id, full_name, class_id, hidden_from_students, is_active;
