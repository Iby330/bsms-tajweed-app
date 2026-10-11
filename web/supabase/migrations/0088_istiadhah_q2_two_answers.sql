-- Umm al-Kitab 2 (Al-Istiʿādhah), Q2 "When should the istiʿādhah be said out
-- loud?": two answers are right after all, "Someone is listening to you" and
-- "You are the first to recite in a group". Undoes the key half of 0087.
-- Nothing on it was released; answers already marked are re-marked
-- (all-or-nothing: right only when A and B, and nothing else, are ticked).

begin;

update questions
   set options = jsonb_set(options, '{0,correct}', 'true'::jsonb)
 where id = 'e4e51bdc-c4c0-4fac-99fd-cbf997f13319'
   and options->0->>'value' = 'Someone is listening to you'
   and options->0->>'correct' = 'false'
returning id, options;

update answers
   set auto_marks = case when response->'selected' @> '[0,1]'::jsonb
                          and jsonb_array_length(response->'selected') = 2 then 1 else 0 end
 where question_id = 'e4e51bdc-c4c0-4fac-99fd-cbf997f13319'
   and auto_marks is not null and final_marks is null
returning id, response, auto_marks;

commit;
