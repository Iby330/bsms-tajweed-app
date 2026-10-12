-- Qāʿidah homework 2 (302) is worth 1 mark: the recording is marked out of 1.
--
-- 0083 loaded it as a 0-mark listening task (is_graded false). With points on
-- the task, the marking screen asks the teacher for a mark (carriesNoMark is
-- false) and scoreObjective leaves auto_marks null for the teacher to fill.
--
-- Submissions already in:
--   * approved: Moadh listened and accepted them at 0/0, so they get the mark.
--   * submitted but not yet marked: auto_marks goes back to null so the
--     marking screen asks for a mark instead of carrying a 0.
--   * drafts: untouched; they are scored when they are submitted.

begin;

update questions q
   set points = 1
  from homeworks h
 where h.id = q.homework_id and h.number = 302 and q.is_task;

update homeworks set total_marks = 1, is_graded = true where number = 302;

update answers a
   set final_marks = 1
  from submissions s, homeworks h
 where a.submission_id = s.id and s.homework_id = h.id and h.number = 302
   and s.status = 'approved' and a.response ? 'voice';

update answers a
   set auto_marks = null
  from submissions s, homeworks h
 where a.submission_id = s.id and s.homework_id = h.id and h.number = 302
   and s.status <> 'approved' and s.status <> 'draft';

commit;
