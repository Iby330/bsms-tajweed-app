-- Homework 2 (Ghunna of meem and noon mushaddadah): two questions re-weighted.
--
-- Q6 (recite ٱلنَّاسِ — ٱلنَّفَّـٰثَـٰتِ — حَمَّالَةَ) was a practical task worth
-- nothing, so the marking page had no field for it. It becomes worth 3, marked
-- by the teacher after listening. Every answer it has was a mechanical 0, so
-- those are cleared to "not marked yet": the teacher's queue shows them, and a
-- student whose paper was already released sees "awaiting mark" rather than 0/3.
--
-- Q8 (tap the ghunna in Al-Fajr, 11 words) goes from 1 mark to 5, scored
-- `pairs` (0084): a mark per two right taps, wrong taps cancel, full marks only
-- for all 11. So 11 → 5, 8 to 10 → 4, 6 or 7 → 3. Every answer already marked
-- is re-marked by that rule, released ones included.
--
-- The paper goes from 7 marks to 14. Each step names the value it expects, so
-- a re-run changes nothing.

begin;

-- Q6: a recitation worth 3
update questions set points = 3
  where id = 'ce34d153-ef5d-466f-af54-1961ab6298ce' and is_task and points = 0
  returning id, position, points;

update answers set auto_marks = null, final_marks = null
  where question_id = 'ce34d153-ef5d-466f-af54-1961ab6298ce'
    and coalesce(auto_marks, 0) = 0 and coalesce(final_marks, 0) = 0
    and (auto_marks is not null or final_marks is not null)
  returning id;

-- Q8: re-mark under the new rule while the question still says 1 point
with q as (
  select id, (select array_agg((o->>'position')::int) from jsonb_array_elements(options) o
               where (o->>'correct')::boolean) as key
    from questions
   where id = '4fa5975a-c73d-45d5-8e65-049107175930' and points = 1 and scoring = 'per_option'
),
scored as (
  select a.id,
         greatest(0,
           (select count(*) from jsonb_array_elements_text(coalesce(a.response->'selected', '[]')) x where x::int = any(q.key))
         - (select count(*) from jsonb_array_elements_text(coalesce(a.response->'selected', '[]')) x where not x::int = any(q.key))
         ) as net,
         cardinality(q.key) as n
    from answers a join q on q.id = a.question_id
   where a.auto_marks is not null or a.final_marks is not null
)
update answers a
   set auto_marks  = case when s.net = s.n then 5 else least(4, s.net / 2) end,
       final_marks = case when a.final_marks is null then null
                          when s.net = s.n then 5 else least(4, s.net / 2) end
  from scored s
 where a.id = s.id
returning a.id, a.auto_marks, a.final_marks;

update questions set points = 5, scoring = 'pairs'
  where id = '4fa5975a-c73d-45d5-8e65-049107175930' and points = 1 and scoring = 'per_option'
  returning id, position, points, scoring;

-- the paper's total follows its questions
update homeworks h
   set total_marks = (select sum(points) from questions where homework_id = h.id and not is_bonus)
 where number = 2 and total_marks = 7
 returning number, total_marks;

commit;
