-- Every student account goes, but one: the 2026/27 cohort signs up afresh.
--
-- The programme lead's call, 2026-10-02: remove all students and keep only
-- the test account Adam Whitfield (adam.w@bsms-demo.test) in Masjid Quba.
-- That is last year's 42 real students and the 19 other demo accounts.
-- Returning students come back through /apply; sendLogin makes them a new
-- account.
--
-- Nothing is dropped unread. Every row that hangs off a removed account is
-- copied into `archive` first (*_removed_2026_10_02, not exposed by
-- PostgREST), the accounts included with their email, so a returning
-- student's memorisation history — 992 sign-offs and their targets — can be
-- put back on their new account. Last year's results already went in 0040.
--
-- Removed with them, because they cannot outlive the accounts: Adam's peer
-- review sessions with the demo students who reviewed him (the mistakes
-- board's seed data) and his pairings with them. The demo money rows
-- (deposit entries on demo accounts, with their payments) go too, rather
-- than stay behind nameless in the season's totals.

create temp table gone as
select p.id from profiles p join auth.users u on u.id = p.id
where p.role = 'student' and u.email <> 'adam.w@bsms-demo.test';

create temp table gone_sessions as
select id from revision_sessions
where reciter_id in (select id from gone) or reviewer_id in (select id from gone);

create temp table gone_submissions as
select id from submissions where student_id in (select id from gone);

create temp table gone_entries as
select id from deposit_entries where student_id in (select id from gone);

-- ── archive ─────────────────────────────────────────────────────────────

create table archive.students_removed_2026_10_02 as
select p.*, u.email, c.name as class_name, now() as archived_at
from profiles p join auth.users u on u.id = p.id left join classes c on c.id = p.class_id
where p.id in (select id from gone);

create table archive.hifz_records_removed_2026_10_02 as
select * from hifz_records where student_id in (select id from gone);
create table archive.hifz_profiles_removed_2026_10_02 as
select * from hifz_profiles where student_id in (select id from gone);
create table archive.submissions_removed_2026_10_02 as
select * from submissions where id in (select id from gone_submissions);
create table archive.answers_removed_2026_10_02 as
select * from answers where submission_id in (select id from gone_submissions);
create table archive.voice_notes_removed_2026_10_02 as
select * from voice_notes where submission_id in (select id from gone_submissions);
create table archive.submission_attempts_removed_2026_10_02 as
select * from submission_attempts where submission_id in (select id from gone_submissions);
create table archive.exam_scores_removed_2026_10_02 as
select * from exam_scores where student_id in (select id from gone);
create table archive.strikes_removed_2026_10_02 as
select * from strikes where student_id in (select id from gone);
create table archive.attendance_removed_2026_10_02 as
select * from attendance where student_id in (select id from gone);
create table archive.lesson_watches_removed_2026_10_02 as
select * from lesson_watches where student_id in (select id from gone);
create table archive.revision_sessions_removed_2026_10_02 as
select * from revision_sessions where id in (select id from gone_sessions);
create table archive.revision_mistakes_removed_2026_10_02 as
select * from revision_mistakes where session_id in (select id from gone_sessions);
create table archive.revision_pairs_removed_2026_10_02 as
select * from revision_pairs
where student_a in (select id from gone) or student_b in (select id from gone);
create table archive.deposit_entries_removed_2026_10_02 as
select * from deposit_entries where id in (select id from gone_entries);
create table archive.deposit_payments_removed_2026_10_02 as
select * from deposit_payments where entry_id in (select id from gone_entries);

-- ── remove, children first (most of these are NO ACTION onto profiles) ──

delete from revision_sessions where id in (select id from gone_sessions);  -- mistakes cascade
delete from revision_pairs
where student_a in (select id from gone) or student_b in (select id from gone);
delete from attendance where student_id in (select id from gone);
delete from strikes where student_id in (select id from gone);
delete from exam_scores where student_id in (select id from gone);
delete from lesson_watches where student_id in (select id from gone);
delete from hifz_records where student_id in (select id from gone);
delete from hifz_profiles where student_id in (select id from gone);
delete from submissions where id in (select id from gone_submissions);  -- answers, notes, attempts cascade
delete from deposit_entries where id in (select id from gone_entries);  -- payments cascade
delete from profiles where id in (select id from gone);
delete from auth.users where id in (select id from gone);
