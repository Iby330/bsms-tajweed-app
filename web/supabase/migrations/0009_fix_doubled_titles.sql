-- Tajweed 21's title carries its subject twice — "Waqf wa Ibtidah Waqf wa
-- Ibtidah" — so the student home page renders the name twice on the lesson
-- card. It came in that way from the Google Forms import (the form title
-- itself was doubled), and it affects BOTH the lesson and its homework, since
-- the importer derives one from the other.
--
-- moduleTitle() in lib/curriculum/tree.ts is not at fault: it correctly strips
-- the "Tajweed 21: Tajweed Homework 21 : " prefix and faithfully shows what is
-- left. The data is what is wrong, so the data is what is fixed here.
--
-- Targeted by id rather than by title match. A title-matched UPDATE would
-- match zero rows the moment anything re-imports and shifts the spacing, and
-- would still report success (see LEARNINGS.md, 0008_lesson_videos). The
-- doubled string is asserted in the WHERE only as a guard so a re-run against
-- an already-corrected row is a no-op rather than a silent overwrite.

update lessons
   set title = 'Tajweed 21: Waqf wa Ibtidah'
 where id = 'a9d8c619-ade1-41f1-b043-330b5a984eac'
   and title like '%Waqf wa Ibtidah Waqf wa Ibtidah%';

update homeworks
   set title = 'Tajweed Homework 21: Waqf wa Ibtidah'
 where id = 'd25fbbfe-7c23-40ec-8835-de8f26d840fb'
   and title like '%Waqf wa Ibtidah Waqf wa Ibtidah%';

-- Verify: both should come back with the phrase exactly once.
--   select id, title from lessons   where id = 'a9d8c619-ade1-41f1-b043-330b5a984eac';
--   select id, title from homeworks where id = 'd25fbbfe-7c23-40ec-8835-de8f26d840fb';
