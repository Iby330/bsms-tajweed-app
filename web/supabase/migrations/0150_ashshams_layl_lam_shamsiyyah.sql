-- Ash-Shams rule hunt (Qāʿidah homework 309): وَٱلَّيْلِ in ayah 4 now counts
-- as a lām shamsiyyah to find (Moadh, via Ibrahim, 19 Nov). It was left out
-- on purpose at load (0139), so tagging it was marked wrong and cost a mark.
--
-- Its ٱ and لَّ become the fourth lām shamsiyyah (`lam_shamsi-4`, appended so
-- the three already live keep their numbers), and the paper goes from 16 marks
-- to 17. This is exactly what execution/homework_sql.ts now generates from
-- docs/homework-2026-27/final/qaidah-hw9.json, checked option by option: only
-- these two options change. Done in place rather than by reloading the paper,
-- which would delete the class's hand-ins.
--
-- Marks already given are re-scored separately, by the app's own hunt scorer.
--
-- Idempotent.

update questions q
   set points = 17,
       options = (
         select jsonb_agg(
                  case when o->>'label' in ('H:91:4:1:2:lam_shamsi', 'H:91:4:1:3:lam_shamsi')
                       then o || '{"correct": true, "inst": "lam_shamsi-4"}'::jsonb
                       else o end
                  order by (o->>'position')::int)
           from jsonb_array_elements(q.options) o)
 where q.homework_id = (select id from homeworks where number = 309)
   and q.qtype = 'checkbox';

update homeworks set total_marks = 17 where number = 309;

select h.total_marks, q.points,
       (select count(*) from jsonb_array_elements(q.options) o where o->>'inst' like 'lam_shamsi-%') as lam_shamsi_options
  from homeworks h join questions q on q.homework_id = h.id
 where h.number = 309 and q.qtype = 'checkbox';
