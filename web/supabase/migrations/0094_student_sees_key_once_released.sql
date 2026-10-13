-- A student whose homework has been marked and released can see the key.
--
-- get_homework_for_student rebuilt every option as position, label and value
-- only, so a returned paper could never show what the student missed: on
-- HW2 Q8 (tap the ghunna in Al-Fajr) teachers saw the missed words in yellow
-- and the student saw only their own taps. `correct` now rides along, but
-- only when the caller's own submission for this homework is approved — never
-- while it is a draft, waiting to be marked, or a redo in progress, when the
-- key would be the answers.
--
-- Edited in place, as 0090 does: the function has been patched by several
-- migrations and retyping it whole would risk dropping one of them.

do $$
declare
  def text := pg_get_functiondef('public.get_homework_for_student(uuid)'::regprocedure);
  old_opt constant text := $o$'position', o->'position', 'label', o->'label', 'value', o->'value'$o$;
  new_opt constant text := $o$'position', o->'position', 'label', o->'label', 'value', o->'value',
                'correct', case when exists (
                  select 1 from submissions s
                   where s.homework_id = h.id and s.student_id = auth.uid() and s.status = 'approved'
                ) then o->'correct' end$o$;
begin
  if position($o$'correct', case when exists$o$ in def) > 0 then return; end if;
  if (length(def) - length(replace(def, old_opt, ''))) / length(old_opt) <> 1 then
    raise exception 'get_homework_for_student option builder is not the one this migration expects';
  end if;
  execute replace(def, old_opt, new_opt);
end $$;
