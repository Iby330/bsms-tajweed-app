-- Homework 4 Q4 (tap the idghaam WITH ghunna in Al-Balad 90:1–10): the key now
-- counts the rule when two ayat are joined. The teachers' ruling (2026-10-26):
-- every rule that happens on joining ayat is correct. أَحَدٌ (90:5) meets
-- يَقُولُ (90:6), tanween before yā', so both words join the key (8 words).
-- It is the only ayah join in any live tap question that changes its answer;
-- the papers that say "stop at the end of every ayah" are left as they are.
--
-- Each answer is re-marked the way the app marks it, from the live rows on
-- 2026-10-26. A mark already given is never lowered (final = the higher of the
-- teacher's mark and the new one), so marks given by eye stand; an answer not
-- yet marked is left for the app to mark from the new key. Every update names
-- the values it expects, so a mark changed since is left alone.

begin;
update questions set options = jsonb_set(options, '{21,correct}', 'true'::jsonb)
  where id = '992dc723-073a-44f8-9c37-ece712acfb5c' and options->21->>'label' = '90:5:6:594:8' and options->21->>'correct' = 'false' returning id, position;
update questions set options = jsonb_set(options, '{22,correct}', 'true'::jsonb)
  where id = '992dc723-073a-44f8-9c37-ece712acfb5c' and options->22->>'label' = '90:6:1:594:8' and options->22->>'correct' = 'false' returning id, position;
update answers set auto_marks = 2.25 where id = '06352c9c-be1c-4a73-b6a2-26d8a8e7958d' and auto_marks = 3 and final_marks = 3 returning id, final_marks;
update answers set auto_marks = 1.13 where id = '0636af47-5884-4d00-8f21-b63fcc5e3000' and auto_marks = 0 and final_marks is null returning id, final_marks;
update answers set auto_marks = 1.13 where id = '178ea242-88ca-4192-a270-bb2181c75a15' and auto_marks = 0 and final_marks = 2 returning id, final_marks;
update answers set auto_marks = 2.25 where id = '2a610958-0537-4ef9-b975-b76f24de3557' and auto_marks = 3 and final_marks = 3 returning id, final_marks;
update answers set auto_marks = 2.25 where id = '2bdea8b5-ef96-4425-befa-1fcb582d41c8' and auto_marks = 3 and final_marks = 3 returning id, final_marks;
update answers set auto_marks = 2.25 where id = '567c7c1a-a245-41af-8a0d-74f6619af341' and auto_marks = 3 and final_marks = 3 returning id, final_marks;
update answers set auto_marks = 1.13, final_marks = 1.13 where id = '79397250-12fc-4fcb-94ea-424311f18034' and auto_marks = 0 and final_marks = 0 returning id, final_marks;  -- final 0 → 1.13
update answers set auto_marks = 2.25 where id = '7eadc751-34ba-4a19-bbe7-bd8c4fa83835' and auto_marks = 3 and final_marks = 3 returning id, final_marks;
update answers set auto_marks = 2.25 where id = 'd38ce02a-9d50-4e22-8ac5-c4c3ef052a88' and auto_marks = 3 and final_marks = 3 returning id, final_marks;
update answers set auto_marks = 2.25 where id = 'da60adaf-bcbe-4e5f-9a1c-bf5b0c6346bb' and auto_marks = 3 and final_marks = 3 returning id, final_marks;
update answers set auto_marks = 2.25 where id = 'ddbc0c60-c19f-491d-8825-d0ef33516889' and auto_marks = 3 and final_marks = 3 returning id, final_marks;
update answers set auto_marks = 2.25 where id = 'de38298b-a735-4af7-a83d-bafb35f85fc0' and auto_marks = 3 and final_marks = 3 returning id, final_marks;
update answers set auto_marks = 2.25 where id = 'f775274a-9676-4f11-a3c1-239011904f06' and auto_marks = 3 and final_marks = 3 returning id, final_marks;
update answers set auto_marks = 1.13, final_marks = 1.13 where id = 'fcdf1054-def3-4062-8ab7-f95ec2b282d4' and auto_marks = 0 and final_marks = 1 returning id, final_marks;  -- final 1 → 1.13
update answers set auto_marks = 1.5 where id = 'feed0a09-6f23-44df-8a7f-faca15ce55df' and auto_marks = 2 and final_marks = 2 returning id, final_marks;
commit;
