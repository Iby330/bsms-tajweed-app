-- ═══════════════════════════════════════════════════════════════════════
-- Fix: students could not see their own marks.
--
-- The grading views were security_invoker, so a student's query applied RLS to
-- every joined table. Students deliberately have NO read policy on `questions`
-- (that is what stops answer keys leaking), which silently emptied the join —
-- progress tiles and leaderboards rendered "no data yet" for every student.
--
-- Fix: the views run as owner (definer) so the joins resolve, and row
-- visibility is enforced INSIDE the view instead:
--   · v_hw_pct_all  — unfiltered, NOT granted to users; only the leaderboard
--                     views read it, and they only ever emit aggregates
--   · v_hw_pct      — filtered to the caller (or any teacher), granted to users
-- Net effect: a student sees their own marks and their rank, never anyone
-- else's marks; teachers keep full visibility; answer keys stay unreadable.
-- ═══════════════════════════════════════════════════════════════════════

drop view if exists v_lb_individual;
drop view if exists v_lb_class;
drop view if exists v_lb_hifz_class;
drop view if exists v_eoy;
drop view if exists v_term_pct;
drop view if exists v_termly_avg;
drop view if exists v_hw_pct;
drop view if exists v_hifz_progress;

-- ── base: every approved homework percentage, unfiltered ──────────────
create view v_hw_pct_all as
  select s.student_id, h.id as homework_id, h.number, w.term_id,
         sum(a.final_marks) filter (where not q.is_bonus) / h.total_marks * 100 as pct
  from submissions s
  join homeworks h on h.id = s.homework_id and h.is_graded
  join weeks w on w.id = h.week_id
  join answers a on a.submission_id = s.id
  join questions q on q.id = a.question_id
  where s.status = 'approved'
  group by s.student_id, h.id, h.number, w.term_id, h.total_marks;

revoke all on v_hw_pct_all from authenticated, anon;

-- ── caller-scoped views (row filter lives here, not in RLS) ───────────
create view v_hw_pct as
  select * from v_hw_pct_all
  where student_id = auth.uid() or is_teacher();

create view v_termly_avg as
  select student_id, term_id, avg(pct) as hw_avg
  from v_hw_pct_all
  where pct > 0 and (student_id = auth.uid() or is_teacher())
  group by student_id, term_id;

create view v_term_pct as
  select t.student_id, t.term_id,
         0.8 * (e.score / tm.exam_max * 100) + 0.2 * t.hw_avg as term_pct
  from (
    select student_id, term_id, avg(pct) as hw_avg
    from v_hw_pct_all where pct > 0 group by student_id, term_id
  ) t
  join exam_scores e on e.student_id = t.student_id and e.term_id = t.term_id
  join terms tm on tm.id = t.term_id
  where t.student_id = auth.uid() or is_teacher();

create view v_eoy as
  select student_id, avg(term_pct) as eoy_pct from (
    select t.student_id, t.term_id,
           0.8 * (e.score / tm.exam_max * 100) + 0.2 * t.hw_avg as term_pct
    from (
      select student_id, term_id, avg(pct) as hw_avg
      from v_hw_pct_all where pct > 0 group by student_id, term_id
    ) t
    join exam_scores e on e.student_id = t.student_id and e.term_id = t.term_id
    join terms tm on tm.id = t.term_id
  ) x
  where x.student_id = auth.uid() or is_teacher()
  group by student_id
  having count(*) = 3;

create view v_hifz_progress as
  select hp.student_id, hp.start_surah, hp.target_count,
         count(hr.surah_number) as passed,
         count(hr.surah_number)::numeric / hp.target_count * 100 as pct
  from hifz_profiles hp
  left join hifz_records hr on hr.student_id = hp.student_id
  where hp.student_id = auth.uid() or is_teacher()
  group by hp.student_id, hp.start_surah, hp.target_count;

-- unfiltered hifz base for the class leaderboard
create view v_hifz_progress_all as
  select hp.student_id, hp.target_count,
         count(hr.surah_number)::numeric / hp.target_count * 100 as pct
  from hifz_profiles hp
  left join hifz_records hr on hr.student_id = hp.student_id
  group by hp.student_id, hp.target_count;

revoke all on v_hifz_progress_all from authenticated, anon;

-- ── leaderboards: aggregates only, scoped to the caller's section ─────
create view v_lb_individual as
  select p.full_name, c.name as class_name, round(avg(hp.pct), 2) as pct,
         rank() over (order by avg(hp.pct) desc) as rank
  from v_hw_pct_all hp
  join profiles p on p.id = hp.student_id and p.is_active
  join classes c on c.id = p.class_id
  where p.section = (select section from profiles where id = auth.uid())
  group by p.id, p.full_name, c.name;

create view v_lb_class as
  select c.name as class_name, c.section, round(avg(hp.pct), 2) as pct,
         rank() over (order by avg(hp.pct) desc) as rank
  from v_hw_pct_all hp
  join profiles p on p.id = hp.student_id and p.is_active
  join classes c on c.id = p.class_id
  where c.section = (select section from profiles where id = auth.uid())
  group by c.id, c.name, c.section;

create view v_lb_hifz_class as
  select c.name as class_name, c.section, round(avg(h.pct), 2) as pct,
         rank() over (order by avg(h.pct) desc) as rank
  from v_hifz_progress_all h
  join profiles p on p.id = h.student_id and p.is_active
  join classes c on c.id = p.class_id
  where c.section = (select section from profiles where id = auth.uid())
  group by c.id, c.name, c.section;

grant select on v_hw_pct, v_termly_avg, v_term_pct, v_eoy, v_hifz_progress,
                v_lb_individual, v_lb_class, v_lb_hifz_class to authenticated;

-- ── cosmetic: the importer double-prefixed generated lesson titles ────
update lessons
   set title = regexp_replace(title, '^Tajweed (\d+) — Tajweed Homework \1: ', 'Tajweed \1 — ')
 where title ~ '^Tajweed \d+ — Tajweed Homework \d+: ';

update lessons
   set title = regexp_replace(title, '^Tajweed (\d+) — ', 'Tajweed \1: ')
 where title ~ '^Tajweed \d+ — ';
