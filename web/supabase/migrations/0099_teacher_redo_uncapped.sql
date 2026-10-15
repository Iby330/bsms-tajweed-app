-- ═══════════════════════════════════════════════════════════════════════
-- The 60% cap on a redo (0064) is for a paper that FAILED, not for one a
-- teacher sent back. 0064 capped every attempt past the first, but an
-- attempt moves on for two reasons: a release below the pass mark (the
-- automatic redo), or the teacher's own "Send back to redo" on a paper that
-- passed, most often because the student handed in too early or left a
-- question blank. The second is a do-over, not a second chance at a fail,
-- and capping it took a 90% paper down to 60% on every board.
--
-- So the cap now holds only when an earlier attempt of this submission was
-- released below 60%. `submission_attempts.pct` is the mark each superseded
-- attempt was sent back from, so that is read straight off the snapshots,
-- with no new column and nothing to backfill: the teacher send-backs made
-- before this lands come out uncapped too. A failed attempt stays failed:
-- fail, redo, then a teacher send-back of the redo is still capped.
--
-- `pct < 60` is false for a null pct (an imported or unscorable paper sent
-- back), which is right: no mark is no fail. The view runs as its owner
-- (no security_invoker), so a student's own read of v_hw_pct still sees the
-- snapshots that `submission_attempts` RLS keeps from them.
--
-- Same columns in the same order as 0064, so `create or replace` is allowed.
-- ═══════════════════════════════════════════════════════════════════════

create or replace view v_hw_pct_all as
  select student_id,
         homework_id,
         number,
         term_id,
         case when failed_before and pct > 60 then 60 else pct end as pct
    from (
      select s.student_id,
             h.id       as homework_id,
             h.number,
             w.term_id,
             exists (
               select 1 from submission_attempts sa
                where sa.submission_id = s.id and sa.pct < 60
             ) as failed_before,
             (coalesce(
                sum(a.final_marks) filter (where not q.is_bonus),
                s.imported_marks
              ) / h.total_marks) * 100 as pct
        from submissions s
        join homeworks h on h.id = s.homework_id and h.is_graded
        join weeks     w on w.id = h.week_id
        left join answers   a on a.submission_id = s.id
        left join questions q on q.id = a.question_id
       where s.status = 'approved'
       group by s.student_id, s.id, h.id, h.number, w.term_id, h.total_marks,
                s.imported_marks
    ) raw;
