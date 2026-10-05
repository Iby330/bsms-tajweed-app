-- Homework 2 (Ghunna of meem and noon mushaddadah): two fixes to the answer key,
-- and the Q8 marks they move. Generated from the live rows on 2026-10-05.
--
-- Q4: option C was اُمَّمٌ, which is not a word in the Qur'an (the word is أُمَمٌ,
-- with no shaddah, so no ghunna), keyed correct. It becomes ثُمَّ (6:38), also
-- correct, so no one's mark moves: every student ticked A and C.
--
-- Q8 (tap the ghunna in Al-Fajr): مَّرْضِيَّةً (89:28) was left out of the key because
-- its shaddah comes from idghām. The teachers' ruling: every mīm or nūn with a
-- shaddah takes the ghunna, whatever made the shaddah. It joins the key (11 words).
-- Each answer is re-marked the way the app marks it; an approved mark is never
-- lowered (final = the higher of the teacher's mark and the new one). Every
-- update names the values it expects, so a mark changed since is left alone.

begin;
update questions set options = jsonb_set(options, '{2,value}', to_jsonb($q$ثُمَّ$q$::text))
  where id = 'cf06ea00-bb7c-436f-8fe9-d03bbaf0e835' and options->2->>'value' = $q$اُمَّمٌ$q$ returning id, position;
update questions set options = jsonb_set(options, '{131,correct}', 'true'::jsonb)
  where id = '4fa5975a-c73d-45d5-8e65-049107175930' and options->131->>'label' = '89:28:5:594:3' and options->131->>'correct' = 'false' returning id, position;
update answers set auto_marks = 0.91, final_marks = 1 where id = '4b5e352b-2491-49db-afc3-715979c9e0c2' and auto_marks = 1 and final_marks = 1 returning id, final_marks;
update answers set auto_marks = 0.45, final_marks = 0.5 where id = 'e0e46121-f8a2-449a-907e-7c5bf2bff549' and auto_marks = 0.5 and final_marks = 0.5 returning id, final_marks;
update answers set auto_marks = 0.91, final_marks = 1 where id = '68052957-4356-4d0e-b3dc-fb0ef42cc19d' and auto_marks = 1 and final_marks = 1 returning id, final_marks;
update answers set auto_marks = 0.82, final_marks = 0.82 where id = '57d98d0a-6cb9-4e44-8bf2-e10846cb1ba1' and auto_marks = 0.7 and final_marks = 0.8 returning id, final_marks;  -- 0.8 → 0.82
update answers set auto_marks = 0.73, final_marks = 0.73 where id = '4bae8122-7800-4cf0-976e-c83660a7ee6b' and auto_marks = 0.6 and final_marks = 0.7 returning id, final_marks;  -- 0.7 → 0.73
update answers set auto_marks = 1, final_marks = 1 where id = '3a8f0541-b994-4a31-bceb-463fe3092a27' and auto_marks = 0.9 and final_marks = 1 returning id, final_marks;
update answers set auto_marks = 1, final_marks = 1 where id = 'abd87296-f147-4037-aed1-e9e2515b980b' and auto_marks = 0.9 and final_marks = 1 returning id, final_marks;
update answers set auto_marks = 0.91, final_marks = 0.91 where id = '722c8492-8663-401d-9972-3e6e5babc96d' and auto_marks = 0.8 and final_marks = 0.9 returning id, final_marks;  -- 0.9 → 0.91
update answers set auto_marks = 0.82, final_marks = 0.82 where id = 'c82733eb-be98-47f5-b0f9-a89576737183' and auto_marks = 0.7 and final_marks = 0.8 returning id, final_marks;  -- 0.8 → 0.82
commit;
