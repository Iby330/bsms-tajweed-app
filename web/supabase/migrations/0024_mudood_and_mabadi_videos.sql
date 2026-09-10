-- ═══════════════════════════════════════════════════════════════════════
-- The Mudood and Mabādi' series get their videos.
--
-- Both have existed since 0003 with `youtube_id` null — "null until the
-- channel re-uploads after summer", as the seed put it. Both playlists are
-- now up:
--   Mudood   https://www.youtube.com/playlist?list=PLHmJhTMr3j6E
--   Mabādi'  https://www.youtube.com/playlist?list=PLA6so8zrSdsjaxhKBJkF582Ms_YN5_aT2
--
-- Every pairing is corroborated twice: the playlist's episode number matches
-- the lesson's own numbering (Tajweed 16 → Ep. 16, HW 1 → Ep. 1), and the
-- video titles match the lesson titles topic for topic. Each id was checked
-- against YouTube's oembed endpoint and returns a playable video.
--
-- The Mabādi' videos are UNLISTED, not public. That is fine for the embedded
-- player and for anyone following a link, but they will not surface in
-- YouTube search or on the channel page. If they are ever set back to
-- private, the embeds go dark and these ids stop resolving — unlisted is the
-- weakest setting that still works here.
--
-- Rows are addressed by (series, term, week number) rather than by title:
-- these titles carry a doubled prefix from the original import that 0009 only
-- partly cleaned up, so they are exactly the mutable text a migration should
-- not match on. `weeks` carries unique (term_id, number), so each subquery
-- resolves to a single row.
--
-- Idempotent: re-running sets the same values and reports nothing changed.
-- ═══════════════════════════════════════════════════════════════════════

-- ── Mudood — Tajweed 16–21, Term 3 weeks 1–6 ─────────────────────────────
update lessons l
   set youtube_id = v.youtube_id
  from (values
    (1, 'IrmQAqrw8UM'),  -- Ep. 16 — Broad categories & key terms
    (2, 'N3z5YkZPJnI'),  -- Ep. 17 — Madd Muttasil
    (3, 'p_ud9aajAag'),  -- Ep. 18 — Madd Munfasil
    (4, 'PcFqrRk0x7Y'),  -- Ep. 19 — Madd 'Arid lil Sukoon + speeds of recitation
    (5, 'gvzpp5vfu5A'),  -- Ep. 20 — Madd Lazim
    (6, 'zlGzY7gC6E0')   -- Ep. 21 — Waqf and Ibtidaa'
  ) as v(week_number, youtube_id)
 where l.series = 'tajweed'
   and l.week_id = (select id from weeks where term_id = 3 and number = v.week_number)
   and l.youtube_id is distinct from v.youtube_id;

-- ── Mabādi' — the Ten Fundamental Principles, Term 3 weeks 1–7 ───────────
update lessons l
   set youtube_id = v.youtube_id
  from (values
    (1, '4RPXFovubos'),  -- Ep. 1 — Introduction to Mutoon
    (2, 'pxNNJDg5W6Q'),  -- Ep. 2 — The contents of this text
    (3, '90kQy_y0Hn8'),  -- Ep. 3 — The definition and structured contents of Tajweed
    (4, '6BFn6wFbKE0'),  -- Ep. 4 — The fruits of mastering Tajweed
    (5, 'gOlE0EJUE3k'),  -- Ep. 5 — Relationship to other sciences, and its virtues
    (6, 'NsNm36-TQZw'),  -- Ep. 6 — The founder, name and sources of Tajweed
    (7, 'bNA4ndK2_yg')   -- Ep. 7 — The legal status of learning Tajweed
  ) as v(week_number, youtube_id)
 where l.series = 'tfp'
   and l.week_id = (select id from weeks where term_id = 3 and number = v.week_number)
   and l.youtube_id is distinct from v.youtube_id;

-- Proof the batch did something: 13 rows, none of them null.
select l.series, w.number as week, l.youtube_id, l.title
  from lessons l
  join weeks w on w.id = l.week_id
 where w.term_id = 3
   and l.series in ('tajweed', 'tfp')
 order by l.series, w.number;
