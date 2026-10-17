-- Sahabah Stories 1, the first session of the weekly halaqah, into Term 1's
-- Sahabah Stories course (0095). Item 1 of the course, so it opens for every
-- class from the start of Term 1, which has passed: it is open on arrival.
-- Filed in Term 1 week 1 beside Tajweed 1 and Umm al-Kitab 1, after them.
-- Title from the video's own YouTube title, in the house "Course N: …" form.
insert into lessons (week_id, series, title, youtube_id, position, course_id, ordinal)
select w.id, 'seerah',
       'Sahabah Stories 1: The 4-minute mile and why we study the pious before us',
       'WLClZyBIBfU', 3, c.id, 1
  from weeks w, courses c
 where w.term_id = 1 and w.number = 1 and c.key = 'sahabah_t1'
   and not exists (select 1 from lessons l where l.course_id = c.id and l.ordinal = 1)
returning id, title, youtube_id;
