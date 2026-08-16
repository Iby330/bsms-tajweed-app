-- Historical homework results, carried over from the 2025/26 master spreadsheet.
--
-- The app has never stored a homework total: v_hw_pct_all computes one by
-- summing answers.final_marks. That works for work done inside the app, where
-- every question carries its own mark, and not at all for last year's results,
-- which arrive as a single figure per homework because Google Forms only ever
-- exported a total.
--
-- Rather than invent per-question marks to satisfy the shape of the view, the
-- total is stored as what it is. imported_marks is null for everything the app
-- marked itself, so the two never compete: the sum wins wherever answers exist,
-- and the imported figure is the fallback, not an override.

alter table submissions
  add column if not exists imported_marks numeric;

comment on column submissions.imported_marks is
  'Total mark carried in from the 2025/26 spreadsheet, where per-question marks '
  'were never recorded. Null for anything marked inside the app.';

-- Recreated, not dropped: v_hw_pct, v_termly_avg, v_term_pct and the
-- leaderboards all read this, and dropping it would take them with it.
--
-- Two changes. The joins to answers/questions become LEFT so a submission with
-- no answer rows survives to be counted at all — an inner join silently
-- discarded exactly the rows this migration exists to add. And the sum becomes
-- a coalesce: `sum(...) filter (...)` over zero rows is null, which is the
-- signal that there is nothing to sum and the imported figure should stand.
create or replace view v_hw_pct_all as
  select s.student_id,
         h.id       as homework_id,
         h.number,
         w.term_id,
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
   group by s.student_id, h.id, h.number, w.term_id, h.total_marks, s.imported_marks;
