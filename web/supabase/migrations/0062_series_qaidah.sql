-- Qāʿidah Nūrāniyyah gets its own series, for its first homework (0063).
--
-- The course row (key 'qaidah') has existed since 0026 and Masjid Al-Aqsa and
-- Hareer take it in Term 1 (0053), but nothing could be filed under it: every
-- series_t value belongs to another course, and reusing one would be wrong in
-- two visible ways. The homework page's "watch the video" link matches on
-- week + series, so it would send a Qāʿidah student to Ghunna or Al-Fātiḥah
-- episode 1; and the course catalogue keys a block by (series, term), so the
-- paper would sit inside another course's tile.
--
-- The value is named after the course key on purpose: a class with a
-- syllabus labels its homework by course key (curriculum/tree.ts) and
-- everyone else by series, and one name means one label for both.
--
-- ON ITS OWN because Postgres will not let a transaction use an enum value it
-- added, and apply_migration.ts sends each file as one batch (see 0020).

alter type series_t add value if not exists 'qaidah';
