-- Two content changes.
--
-- 1. Umm al-Kitab 2 (Al-Istiʿādhah), Q2 "When should the istiʿādhah be said
--    out loud?": only "You are the first to recite in a group" is right.
--    "Someone is listening to you" was keyed correct too and no longer is.
--    Nothing on it was released; answers already marked are re-marked
--    (all-or-nothing: right only when B alone is ticked).
--
-- 2. Every graded recording task is now worth marks, one per thing it asks
--    the teacher to listen for, the same rule as the rest of the papers (a
--    mark per part: HW2 Q8 is 5, HW21 Q5 is 10) and as HW2 Q6 (3 words, 3
--    marks). Each gets a mark scheme as its rubric, which only teachers see
--    and which never goes to the model (plan.ts). Qāʿidah 2 is ungraded and
--    is left alone. Any mechanical 0 on a recording not yet released is
--    cleared to "not marked yet" so it shows in the teacher's queue.

begin;

-- 1 ─ the key
update questions
   set options = jsonb_set(options, '{0,correct}', 'false'::jsonb)
 where id = 'e4e51bdc-c4c0-4fac-99fd-cbf997f13319'
   and options->0->>'value' = 'Someone is listening to you'
   and options->0->>'correct' = 'true'
returning id, options;

update answers
   set auto_marks = case when response->'selected' = '[1]'::jsonb then 1 else 0 end
 where question_id = 'e4e51bdc-c4c0-4fac-99fd-cbf997f13319'
   and auto_marks is not null and final_marks is null
returning id, response, auto_marks;

-- 2 ─ recitation marks and mark schemes
create temporary table recite (id uuid, points numeric, rubric jsonb) on commit drop;
insert into recite values
-- HW2 Q6
('ce34d153-ef5d-466f-af54-1961ab6298ce', 3, $j$[
  {"id":"c1","desc":"ٱلنَّاسِ: ghunna on the nūn mushaddadah, held for 2 counts","marks":1},
  {"id":"c2","desc":"ٱلنَّفَّٰثَٰتِ: ghunna on the nūn mushaddadah, held for 2 counts","marks":1},
  {"id":"c3","desc":"حَمَّالَةَ: ghunna on the mīm mushaddadah, held for 2 counts","marks":1}]$j$),
-- HW21 Q6
((select q.id from questions q join homeworks h on h.id = q.homework_id where h.number = 21 and q.position = 6 and q.is_task), 2, $j$[
  {"id":"c1","desc":"Stops at one of the two ۛ marks, after رَيْبَ or after فِيهِ","marks":1},
  {"id":"c2","desc":"Reads straight through the other: never stops at both, never at neither","marks":1}]$j$),
-- Umm al-Kitab 2 Q8
((select q.id from questions q join homeworks h on h.id = q.homework_id where h.number = 202 and q.position = 8 and q.is_task), 2, $j$[
  {"id":"c1","desc":"Three slow recitations of أَعُوذُ بِٱللَّهِ مِنَ ٱلشَّيْطَٰنِ ٱلرَّجِيمِ, every letter and vowel correct","marks":1},
  {"id":"c2","desc":"Once more at normal pace, still correct","marks":1}]$j$),
-- Umm al-Kitab 3 Q7
((select q.id from questions q join homeworks h on h.id = q.homework_id where h.number = 203 and q.position = 7 and q.is_task), 4, $j$[
  {"id":"c1","desc":"Pure kasrah on the ب","marks":1},
  {"id":"c2","desc":"The whistle of the س","marks":1},
  {"id":"c3","desc":"The roll of the ر","marks":1},
  {"id":"c4","desc":"The ح from the throat","marks":1}]$j$),
-- Umm al-Kitab 4 Q7
((select q.id from questions q join homeworks h on h.id = q.homework_id where h.number = 204 and q.position = 7 and q.is_task), 4, $j$[
  {"id":"c1","desc":"The ح from the throat","marks":1},
  {"id":"c2","desc":"The ع from the throat","marks":1},
  {"id":"c3","desc":"The light lām in لِلَّهِ","marks":1},
  {"id":"c4","desc":"The shaddah on the ب of رَبِّ","marks":1}]$j$),
-- Umm al-Kitab 5 Q6
((select q.id from questions q join homeworks h on h.id = q.homework_id where h.number = 205 and q.position = 6 and q.is_task), 4, $j$[
  {"id":"c1","desc":"The light hamzah","marks":1},
  {"id":"c2","desc":"The slight roll on each ر","marks":1},
  {"id":"c3","desc":"The ح from the throat","marks":1},
  {"id":"c4","desc":"The clear kasrah on the ن","marks":1}]$j$),
-- Umm al-Kitab 6 Q7
((select q.id from questions q join homeworks h on h.id = q.homework_id where h.number = 206 and q.position = 7 and q.is_task), 4, $j$[
  {"id":"c1","desc":"The light م","marks":1},
  {"id":"c2","desc":"The light ي","marks":1},
  {"id":"c3","desc":"The clear kasrahs","marks":1},
  {"id":"c4","desc":"The brief stop on the shaddah of the د","marks":1}]$j$),
-- Umm al-Kitab 7 Q7
((select q.id from questions q join homeworks h on h.id = q.homework_id where h.number = 207 and q.position = 7 and q.is_task), 4, $j$[
  {"id":"c1","desc":"The shaddah on the first إِيَّاكَ","marks":1},
  {"id":"c2","desc":"The shaddah on the second إِيَّاكَ","marks":1},
  {"id":"c3","desc":"The ع from the throat","marks":1},
  {"id":"c4","desc":"The clean break before the و","marks":1}]$j$),
-- Umm al-Kitab 8 Q8
((select q.id from questions q join homeworks h on h.id = q.homework_id where h.number = 208 and q.position = 8 and q.is_task), 5, $j$[
  {"id":"c1","desc":"The light ه","marks":1},
  {"id":"c2","desc":"The light ن before the heavy ص","marks":1},
  {"id":"c3","desc":"The ص, not a س","marks":1},
  {"id":"c4","desc":"No bounce on the lām","marks":1},
  {"id":"c5","desc":"The whistle of the س","marks":1}]$j$),
-- Umm al-Kitab 9 Q8: the whole sūrah, a mark a verse
((select q.id from questions q join homeworks h on h.id = q.homework_id where h.number = 209 and q.position = 8 and q.is_task), 7, $j$[
  {"id":"c1","desc":"Verse 1, the basmalah, as practised in Umm al-Kitab 3","marks":1},
  {"id":"c2","desc":"Verse 2, ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ, as practised in Umm al-Kitab 4","marks":1},
  {"id":"c3","desc":"Verse 3, ٱلرَّحْمَٰنِ ٱلرَّحِيمِ, as practised in Umm al-Kitab 5","marks":1},
  {"id":"c4","desc":"Verse 4, مَٰلِكِ يَوْمِ ٱلدِّينِ, as practised in Umm al-Kitab 6","marks":1},
  {"id":"c5","desc":"Verse 5, إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ, as practised in Umm al-Kitab 7","marks":1},
  {"id":"c6","desc":"Verse 6, ٱهْدِنَا ٱلصِّرَٰطَ ٱلْمُسْتَقِيمَ, as practised in Umm al-Kitab 8","marks":1},
  {"id":"c7","desc":"Verse 7, صِرَٰطَ ٱلَّذِينَ … وَلَا ٱلضَّآلِّينَ, every letter and vowel correct","marks":1}]$j$);

do $guard$ begin
  if (select count(*) from recite where id is not null) <> 10 then
    raise exception 'expected 10 recording tasks, found %', (select count(*) from recite where id is not null);
  end if;
end $guard$;

update questions q
   set points = r.points, rubric = r.rubric
  from recite r
 where q.id = r.id and q.is_task
returning q.id, q.points;

update answers a
   set auto_marks = null
  from recite r, submissions s
 where a.question_id = r.id and s.id = a.submission_id
   and s.status <> 'approved' and a.auto_marks = 0 and a.final_marks is null
returning a.id;

update homeworks h
   set total_marks = (select sum(points) from questions where homework_id = h.id and not is_bonus)
 where h.number in (2, 21, 202, 203, 204, 205, 206, 207, 208, 209)
returning number, total_marks;

commit;
