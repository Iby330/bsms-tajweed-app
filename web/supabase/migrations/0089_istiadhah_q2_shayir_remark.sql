-- Umm al-Kitab 2, Q2: one paper was approved (2026-10-11 14:23) while 0087's
-- one-answer key was live, so ticking only "first to recite in a group" got
-- the mark. Under the two-answer key restored by 0088 it is 0, and the
-- teacher asked for it to be lowered. The paper goes from 10/11 to 9/11,
-- above the redo line.
update answers set auto_marks = 0, final_marks = 0
 where id = '24e07069-15ac-48fb-ab78-69a7b12d587a'
   and response->'selected' = '[1]'::jsonb and final_marks = 1
returning id, auto_marks, final_marks;
