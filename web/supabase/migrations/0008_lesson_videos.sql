-- ═══════════════════════════════════════════════════════════════════════
-- Attach the real YouTube videos to their lessons.
--
-- 0002 seeded lessons with youtube_id null "until the channel re-uploads
-- after summer". It has: @bsmstajweed carries Tajweed Ep. 1-15 and Ummul
-- Kitab Ep. 1-9, which map 1:1 by episode number onto the 24 lessons below.
--
-- Rows are addressed by (series, term, week), NOT by title. Live titles have
-- already drifted from what 0003 wrote (colon vs em dash, from a later Forms
-- re-import), so a title match would silently update nothing. Term/week
-- placement has never moved — 0004 and 0005 shift dates only.
--
-- This also OVERWRITES Tajweed 1, which was left pointing at M7lc1UVf-VE:
-- Google's IFrame-API demo video, from building the player. It has been live
-- to students.
--
-- Not covered, deliberately: Tajweed 16-21 (T3 W1-6) and TFP 1-7 (T3 W1-7)
-- are not on the public channel. If they are unlisted rather than deleted
-- they need only their ids — unlisted videos embed fine, private ones cannot
-- be embedded at all. Add them via the teacher curriculum page, or a 0009.
--
-- Idempotent: a plain UPDATE, safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════

update lessons l
set youtube_id = v.youtube_id
from (values
    ('tajweed',      1, 1, 'UIFFYPHwD40'),  -- Ep. 1  Definitions, Importance and Mistakes
    ('tajweed',      1, 2, 'i4lO6TQUHBM'),  -- Ep. 2  Ghunna: noon & meem with shaddah
    ('tajweed',      1, 3, 'joORVl0SsiY'),  -- Ep. 3  Ghunna: Idhaar Halqi
    ('tajweed',      1, 4, 'X-AOGhqilMw'),  -- Ep. 4  Ghunna: Idghaam
    ('tajweed',      1, 5, 'SiA13h8tWCQ'),  -- Ep. 5  Ghunna: Iqlaab
    ('tajweed',      1, 6, '0WB9vRZI68c'),  -- Ep. 6  Ghunna: Ikhfaa' haqiqi
    ('tajweed',      1, 7, 'fZloAEMwjGw'),  -- Ep. 7  Ghunna: summary of noon sakin/tanween
    ('tajweed',      1, 8, '902KsFgLmOo'),  -- Ep. 8  Ghunna: meem sakin
    ('tajweed',      2, 1, 'Holxa6V-1uw'),  -- Ep. 9  Sifaat: Huruf Al-Isti'laa'
    ('tajweed',      2, 2, '4n-qp1FHYb4'),  -- Ep. 10 Sifaat: The Rule of Laam
    ('tajweed',      2, 3, 'QQQC9ooiXm8'),  -- Ep. 11 Sifaat: The Rule of Raa
    ('tajweed',      2, 4, 'R3D_vnqqTpA'),  -- Ep. 12 Sifaat: Qalqala
    ('tajweed',      2, 5, 'KpDEZZLTkPE'),  -- Ep. 13 Sifaat: common mistakes with Hams
    ('tajweed',      2, 6, 'P0Y_ZZb3T9g'),  -- Ep. 14 Sifaat: Hamzatul wasl
    ('tajweed',      2, 7, 'pxspBVHr2is'),  -- Ep. 15 Sifaat: meeting of 2 sukoons
    ('umm_al_kitab', 1, 1, 'uvLp-T3yXLo'),  -- Ep. 1  Names, virtues, importance of Al-Fatihah
    ('umm_al_kitab', 1, 2, 'j1lODTg5EZg'),  -- Ep. 2  Al-isti'adha
    ('umm_al_kitab', 1, 3, 'Huk0ODM5RfE'),  -- Ep. 3  Al-basmala
    ('umm_al_kitab', 1, 4, 'IQe9A3k03Ho'),  -- Ep. 4  Verse 2
    ('umm_al_kitab', 1, 5, 'Ez0qv8ZxRmo'),  -- Ep. 5  Verse 3
    ('umm_al_kitab', 1, 6, 'KlEpXF2ypjo'),  -- Ep. 6  Verse 4
    ('umm_al_kitab', 1, 7, '7FZbyTxvqIE'),  -- Ep. 7  Verse 5
    ('umm_al_kitab', 1, 8, 'cAbOUFPGjxc'),  -- Ep. 8  Verse 6
    ('umm_al_kitab', 1, 9, 'WC5ZAgH8YOg')   -- Ep. 9  Verse 7
  ) as v(series, term_id, week_number, youtube_id)
join weeks w
  on w.term_id = v.term_id and w.number = v.week_number
where l.week_id = w.id
  -- lessons.series is the enum series_t, the VALUES literal is text. Cast the
  -- literal TO the enum rather than the column to text: a typo'd series key
  -- then errors as an invalid enum label instead of silently matching no rows.
  and l.series = v.series::series_t;
