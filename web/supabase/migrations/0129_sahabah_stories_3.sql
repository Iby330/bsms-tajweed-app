-- Sahabah Stories 3, the third session of the weekly halaqah, into Term 1's
-- Sahabah Stories course (0095) as item 3. The course is in every class's
-- Resources (0121) and on no class's plan (0122), so it shows there beside
-- sessions 1 and 2 at once. A lesson needs a week: Term 1 week 3, after that
-- week's other lessons, the way 0120 filed session 2 in week 2.
-- Title from the video's own YouTube title, in the house "Course N: …" form.
insert into lessons (week_id, series, title, youtube_id, position, course_id, ordinal)
select w.id, 'seerah',
       'Sahabah Stories 3: Khadija: Behind every great man is a great woman',
       'uskmceB_V2M',
       coalesce((select max(l.position) from lessons l where l.week_id = w.id), 0) + 1,
       c.id, 3
  from weeks w, courses c
 where w.term_id = 1 and w.number = 3 and c.key = 'sahabah_t1'
   and not exists (select 1 from lessons l where l.course_id = c.id and l.ordinal = 3)
returning id, title, youtube_id, position;
