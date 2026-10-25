-- Seerah Reflections, the channel's series on the life of the Prophet ﷺ, is
-- its own series: `seerah` is Sahabah Stories' key (0095), and a series holds
-- one course a term. On its own, as a new enum value cannot be used in the
-- batch that adds it; 0124 fills it.
alter type series_t add value if not exists 'seerah_reflections';
