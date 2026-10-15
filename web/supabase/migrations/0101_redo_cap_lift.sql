-- ═══════════════════════════════════════════════════════════════════════
-- A teacher can lift the 60% cap off a redo.
--
-- A release below 60% sends the paper back as a capped redo the moment it
-- is approved (0030, 0099). Sometimes that fail was a slip, not a fail: the
-- student handed in too early or left questions blank, and the teacher only
-- saw it after releasing. "Reopen" (keep the answers, same attempt, never
-- capped) is the way round it before release; this is the way back after.
--
-- The lift is kept on the snapshots that impose the cap, not on the live
-- submission, so it covers the attempts that were sent back when the teacher
-- pressed it and no more: fail the redo too, and the snapshot that adds is
-- not lifted, so the next redo is capped again.
--
-- 0100's `capped` flag stays in the view, false on every row: the teacher's
-- capped send-back it was added for was dropped before it shipped.
-- ═══════════════════════════════════════════════════════════════════════

alter table submission_attempts
  add column if not exists cap_lifted boolean not null default false;

-- 0100 with the lift. Same columns, same order.
create or replace view v_hw_pct_all as
  select student_id,
         homework_id,
         number,
         term_id,
         case when capped_before and pct > 60 then 60 else pct end as pct
    from (
      select s.student_id,
             h.id       as homework_id,
             h.number,
             w.term_id,
             exists (
               select 1 from submission_attempts sa
                where sa.submission_id = s.id
                  and (sa.pct < 60 or sa.capped)
                  and not sa.cap_lifted
             ) as capped_before,
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
