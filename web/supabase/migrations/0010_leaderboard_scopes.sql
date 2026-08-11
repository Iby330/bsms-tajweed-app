-- Leaderboards gain a second scope: a student can now look at where they sit
-- across their whole cohort, or only within their own class.
--
-- Two design constraints shaped this:
--
--  1. Rank is a computed standing, and this codebase keeps every such number
--     in SQL (see lib/dashboard/queries.ts). Filtering a cohort-ranked list
--     down to one class in JS would leave gaps — ranks 3, 7, 12 — and
--     re-ranking it in JS would move a grade formula out of the database.
--     So each view carries BOTH ranks: `rank` across the section and
--     `class_rank` partitioned by class. The toggle picks a column; nothing
--     is recomputed.
--
--  2. Section scoping (brothers/sisters) already lives in these views and is
--     preserved exactly as-is — `where p.section = (select section from
--     profiles where id = auth.uid())`. A student never sees the other
--     section under either scope.
--
-- v_lb_individual is recreated only to add class_rank; its existing columns,
-- filter and semantics are unchanged.

drop view if exists v_lb_individual;

create view v_lb_individual as
  select p.full_name, c.name as class_name,
         round(avg(hp.pct), 2) as pct,
         rank() over (order by avg(hp.pct) desc) as rank,
         rank() over (partition by c.id order by avg(hp.pct) desc) as class_rank
  from v_hw_pct_all hp
  join profiles p on p.id = hp.student_id and p.is_active
  join classes c on c.id = p.class_id
  where p.section = (select section from profiles where id = auth.uid())
  group by p.id, p.full_name, c.id, c.name;

-- Per-student hifz standing, mirroring v_lb_individual. v_hifz_progress_all
-- is already one row per student, so there is nothing to average here — the
-- rank is over the stored pct directly.
create view v_lb_hifz_individual as
  select p.full_name, c.name as class_name,
         round(h.pct, 2) as pct,
         rank() over (order by h.pct desc) as rank,
         rank() over (partition by c.id order by h.pct desc) as class_rank
  from v_hifz_progress_all h
  join profiles p on p.id = h.student_id and p.is_active
  join classes c on c.id = p.class_id
  where p.section = (select section from profiles where id = auth.uid());

grant select on v_lb_individual, v_lb_hifz_individual to authenticated;
