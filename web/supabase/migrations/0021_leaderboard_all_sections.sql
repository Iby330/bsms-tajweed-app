-- A third leaderboard scope: the whole programme, both sections at once.
--
-- Until now every leaderboard view ended with
--
--     where p.section = (select section from profiles where id = auth.uid())
--
-- and migration 0010 recorded that as a deliberate constraint: "A student
-- never sees the other section under either scope." That is being relaxed on
-- purpose — teachers and students alike asked to see where they stand against
-- everyone, not only their own cohort. The section-scoped views are left
-- exactly as they are and keep their meaning; these are additive siblings, so
-- the existing scope is still one option among several rather than a thing
-- that quietly changed underneath its callers.
--
-- The demo cohort is the reason this is not simply "drop the where clause".
-- Migration 0020 isolates the training cohort USING that section filter and
-- nothing else — a demo student reactivated into a real section "appears, by
-- name and percentage, on the Home screen of all four real sisters-side
-- teachers". Removing the filter outright would do precisely that, to every
-- real teacher and student at once, which is the failure 0020 was written to
-- prevent. So the predicate is swapped rather than deleted:
--
--     real viewer (brothers/sisters) -> every non-demo row, both sections
--     demo viewer                    -> demo rows only, exactly as before
--
-- A demo teacher therefore still sees a demo-only programme under "everyone",
-- which is the honest answer for a training cohort: their "whole programme"
-- IS the demo classes. Isolation holds in both directions, as 0020 requires.
--
-- Ranks are recomputed over the wider population rather than reused. A rank
-- is a standing within a stated field, so a student ranked 4th of 30 brothers
-- is not 4th of 60 across the programme, and carrying the section rank onto a
-- cross-section board would print a number that is simply false. This follows
-- 0010's rule that every such number is computed in SQL and never in JS.

-- Homework, per student, across both sections.
create or replace view v_lb_individual_all as
  select p.full_name, c.name as class_name, p.section,
         round(avg(hp.pct), 2) as pct,
         rank() over (order by avg(hp.pct) desc) as rank
  from v_hw_pct_all hp
  join profiles p on p.id = hp.student_id and p.is_active
  join classes c on c.id = p.class_id
  where case
          when (select section from profiles where id = auth.uid()) = 'demo'
            then p.section = 'demo'
          else p.section <> 'demo'
        end
  group by p.id, p.full_name, c.name, p.section;

-- Hifdh, per class, across both sections. Mirrors v_lb_hifz_class, which
-- reads v_hifz_progress_all and averages per class; only the filter and the
-- resulting rank differ.
create or replace view v_lb_hifz_class_all as
  select c.name as class_name, c.section,
         round(avg(h.pct), 2) as pct,
         rank() over (order by avg(h.pct) desc) as rank
  from v_hifz_progress_all h
  join profiles p on p.id = h.student_id and p.is_active
  join classes c on c.id = p.class_id
  where case
          when (select section from profiles where id = auth.uid()) = 'demo'
            then c.section = 'demo'
          else c.section <> 'demo'
        end
  group by c.id, c.name, c.section;

grant select on v_lb_individual_all, v_lb_hifz_class_all to authenticated;

comment on view v_lb_individual_all is
  'Homework standing across brothers and sisters together, ranked over that '
  'wider field. The demo cohort stays isolated in both directions (see 0020): '
  'a demo viewer sees demo rows only, a real viewer sees no demo rows.';

comment on view v_lb_hifz_class_all is
  'Hifdh standing per class across brothers and sisters together. Same demo '
  'isolation as v_lb_individual_all.';
