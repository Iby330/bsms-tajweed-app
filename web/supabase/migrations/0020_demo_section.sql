-- A third cohort that isn't a cohort: 'demo'.
--
-- Teachers joining in October need somewhere to learn the app that is not the
-- live register. Giving them a class of demo students is easy; keeping those
-- demo students out of everybody else's screens is the part that needs a
-- mechanism, because the leaderboards are cohort-wide by design:
--
--   v_lb_individual, v_lb_hifz_individual, v_lb_hifz_class
--     ... where p.section = (select section from profiles where id = auth.uid())
--
-- So a demo student reactivated into the sisters section appears, by name and
-- percentage, on the Home screen of all four real sisters-side teachers. The
-- alternative — leaving the demo students inactive — empties the demo teacher's
-- own register instead, since teacherRoster() filters on is_active.
--
-- `section` already partitions the cohort, and every one of those views filters
-- on it. A third value therefore isolates the demo cohort in both directions at
-- once, and it does so WITHOUT editing a single existing view, policy or query:
-- a real teacher's section never equals 'demo', so nothing they see changes, and
-- a demo teacher sees only the demo class. That is the whole reason this is an
-- enum value rather than a new is_demo flag — a flag would have meant rewriting
-- three views the five working teachers depend on.
--
-- Additive and reversible in practice: when a demo teacher takes over a real
-- class, move their profile to 'brothers'/'sisters' and set classes.teacher_id.
-- Postgres cannot drop an enum value, which is the one cost of this approach.
--
-- ALTER TYPE ... ADD VALUE cannot be used in the same statement batch that then
-- USES the new label ("unsafe use of new value of enum type"), so this file adds
-- the value and nothing else. Creating the demo class and moving the demo
-- students into it is ordinary DML that follows separately.

alter type section_t add value if not exists 'demo';

comment on type section_t is
  'brothers/sisters are the two real cohorts. demo is a training cohort: the '
  'leaderboard views filter on the viewer''s own section, so demo students and '
  'demo teachers are mutually visible and invisible to everyone else.';
