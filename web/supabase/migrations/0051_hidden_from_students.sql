-- A student who is in a class but kept apart from the other students.
--
-- A special arrangement (2026-10-03): one student joins a class so its teacher
-- can see and mark him, but no other student is to see him — on no
-- leaderboard, individual or class. Students never read each other's
-- profiles (RLS: own row or a teacher), so the leaderboards are the only
-- place one student meets another's name or marks; they all join profiles
-- on `p.is_active`, and this adds `NOT p.hidden_from_students` beside it.
--
-- The student's own screens are untouched — he is an ordinary member of his
-- section and class — and so are the teacher's: registers, rosters and
-- marking read profiles by class, not through these views. A hidden student
-- is also left out of his class's average, so the class board does not move
-- because of him. Only a teacher or the service role can set the flag:
-- students have no UPDATE on profiles.
--
-- Who is hidden is data, set by hand, and deliberately not named here.

alter table profiles add column if not exists hidden_from_students boolean not null default false;

comment on column profiles.hidden_from_students is
  'In a class for the teacher only: left off every leaderboard (v_lb_*) and class average.';

do $$
declare
  v text;
  def text;
  old_join constant text := 'AND p.is_active)))';
  new_join constant text := 'AND p.is_active AND (NOT p.hidden_from_students))))';
begin
  foreach v in array array['v_lb_class', 'v_lb_hifz_class', 'v_lb_hifz_class_all',
                           'v_lb_hifz_individual', 'v_lb_individual', 'v_lb_individual_all'] loop
    def := pg_get_viewdef(('public.' || v)::regclass);
    if def like '%NOT p.hidden_from_students%' then continue; end if;  -- re-run
    if (length(def) - length(replace(def, old_join, ''))) / length(old_join) <> 1 then
      raise exception '% does not join profiles the way this migration expects', v;
    end if;
    execute format('create or replace view public.%I as %s', v, replace(def, old_join, new_join));
  end loop;
end $$;
