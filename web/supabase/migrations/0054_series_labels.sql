-- The two courses with nothing in the app yet are named as series, and only
-- that: what the new Ṣifāt and Makhārij will hold is not decided
-- (programme lead, 2026-10-03). The app's copy is COURSES in
-- lib/curriculum/syllabus.ts, and the course tile now shows such a course's
-- name with no line beneath it.

update courses set label = 'Ṣifāt series' where key = 'sifaat_new';
update courses set label = 'Makhārij series' where key = 'makharij';
