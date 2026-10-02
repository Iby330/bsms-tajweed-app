-- Last year moves out of this year's rows.
--
-- The 2025/26 spreadsheet was imported onto the homework and term rows that
-- 0023/0028 then re-dated to 2026/27, so last year's results sat inside this
-- year: a returning student, whose account sendLogin reuses, would open HW1
-- and find it already approved with last year's mark, and every grading view
-- and leaderboard would open the year full of last year's numbers.
--
-- Moved, not dropped: each row is copied into `archive` (a schema PostgREST
-- does not expose) with the names it needs to be read on its own — the
-- homework rows themselves are being rewritten for 2026/27 — and then deleted
-- from the live table by exact identity, so a re-run removes nothing new.
--
-- What moves: every imported result (imported_marks set, no answers, no
-- voice notes, no redo attempts — checked before writing this), every exam
-- score a real student holds (last year's, and one test entry from August),
-- and the one strike a real student got before the year began (a test).
-- Demo accounts' rows stay where they are for the demo purge.
--
-- Also: HW1's deadline. The year's rule stays Sunday 18:00 after the week it
-- opens (0039), but HW1 is released late, so it is due Monday 12 Oct 17:00.

create schema if not exists archive;
revoke all on schema archive from public, anon, authenticated;

create table if not exists archive.submissions_2025_26 as
select s.*, h.number as homework_number, h.title as homework_title,
       p.full_name as student_name, u.email as student_email, now() as archived_at
from submissions s
join homeworks h on h.id = s.homework_id
join profiles p on p.id = s.student_id
join auth.users u on u.id = s.student_id
where s.imported_marks is not null
  and u.email not ilike '%demo.test';

create table if not exists archive.exam_scores_2025_26 as
select e.*, p.full_name as student_name, u.email as student_email, now() as archived_at
from exam_scores e
join profiles p on p.id = e.student_id
join auth.users u on u.id = e.student_id
where u.email not ilike '%demo.test';

create table if not exists archive.strikes_2025_26 as
select s.*, p.full_name as student_name, u.email as student_email, now() as archived_at
from strikes s
join profiles p on p.id = s.student_id
join auth.users u on u.id = s.student_id
where u.email not ilike '%demo.test'
  and s.issued_at < '2026-10-05';

delete from submissions s using archive.submissions_2025_26 a where s.id = a.id;
delete from exam_scores e using archive.exam_scores_2025_26 a
  where e.student_id = a.student_id and e.term_id = a.term_id
    and e.entered_at is not distinct from a.entered_at;
delete from strikes s using archive.strikes_2025_26 a where s.id = a.id;

update homeworks h
set due_at = timestamp '2026-10-12 17:00' at time zone 'Europe/London'
from weeks w
where w.id = h.week_id and w.unlock_at = '2026-10-05 00:00+00';
