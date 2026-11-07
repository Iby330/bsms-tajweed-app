-- A rule hunt's key is two fields on each option, `correct` and `inst` (the
-- thing to find: web/src/lib/homework/rule-hunt.ts). 0094 releases `correct`
-- to a student once their own paper is approved; `inst` follows it under the
-- same condition, or a returned hunt could not tell what the student missed
-- from what was merely accepted. Null for every other kind of question, and
-- until approval, when the key would be the answers.
--
-- Edited in place, as 0090 and 0094 do: the function has been patched by
-- several migrations and retyping it whole would risk dropping one of them.
--
-- Idempotent.

do $$
declare
  def text := pg_get_functiondef('public.get_homework_for_student(uuid)'::regprocedure);
  old_opt constant text := $o$then o->'correct' end$o$;
  new_opt constant text := $o$then o->'correct' end,
                'inst', case when exists (
                  select 1 from submissions s
                   where s.homework_id = h.id and s.student_id = public.acting_id() and s.status = 'approved'
                ) then o->'inst' end$o$;
begin
  if position($o$'inst', case when exists$o$ in def) > 0 then return; end if;
  if (length(def) - length(replace(def, old_opt, ''))) / length(old_opt) <> 1 then
    raise exception 'get_homework_for_student option builder is not the one this migration expects';
  end if;
  execute replace(def, old_opt, new_opt);
end $$;
