-- Sahabah Stories 5, 'Umair bin Wahb, the fifth session of the weekly halaqah
-- (recorded 26 November, on the BSMS TAJWEED channel as DYihHxrjiuA), into
-- Term 1's Sahabah Stories course (0095) as item 5. The course is in every
-- class's Resources (0121) and on no class's plan (0122), so it shows there
-- beside sessions 1 to 4 at once. Filed in Term 1 week 5, after that week's
-- other lessons, the way 0120, 0129 and 0149 filed sessions 2, 3 and 4.
-- Title from the video's own YouTube title, in the house "Course N: …" form.
-- Its carousel (web/public/carousels/sahabah-05, carousels.json) is keyed by
-- the same YouTube id and shows under the recording once this row exists.
insert into lessons (week_id, series, title, youtube_id, position, course_id, ordinal)
select w.id, 'seerah',
       'Sahabah Stories 5: ''Umair bin Wahb: From deadly assassin to devoted dā’ee',
       'DYihHxrjiuA',
       coalesce((select max(l.position) from lessons l where l.week_id = w.id), 0) + 1,
       c.id, 5
  from weeks w, courses c
 where w.term_id = 1 and w.number = 5 and c.key = 'sahabah_t1'
   and not exists (select 1 from lessons l where l.course_id = c.id and l.ordinal = 5)
returning id, title, youtube_id, position;
