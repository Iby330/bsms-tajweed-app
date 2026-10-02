-- The 21 tajweed lessons take their YouTube titles.
--
-- The rows still carried last year's names ("Tajweed Homework: Introduction",
-- "The Heaviness of Ra"); the videos were retitled as episodes. Each keeps its
-- "Tajweed N:" prefix, which moduleTitle strips for display, and is matched
-- on its video id as well as its number, so a row whose video has changed is
-- left alone rather than given another video's name.

update lessons l
set title = t.title
from (values
  (1, 'UIFFYPHwD40', 'Tajweed 1: Definitions, Importance and Mistakes'),
  (2, 'i4lO6TQUHBM', 'Tajweed 2: Ghunna: ن and م with shaddah'),
  (3, 'joORVl0SsiY', 'Tajweed 3: Ghunna: Idhaar Halqi'),
  (4, 'X-AOGhqilMw', 'Tajweed 4: Ghunna: Idghaam'),
  (5, 'SiA13h8tWCQ', 'Tajweed 5: Ghunna: Iqlaab'),
  (6, '0WB9vRZI68c', 'Tajweed 6: Ghunna: Ikhfaa'' haqiqi'),
  (7, 'fZloAEMwjGw', 'Tajweed 7: Ghunna: Summary of ن sakin and tanween'),
  (8, '902KsFgLmOo', 'Tajweed 8: Ghunna: م sakin'),
  (9, 'Holxa6V-1uw', 'Tajweed 9: Sifaat: Huruf Al-Isti’laa’'),
  (10, '4n-qp1FHYb4', 'Tajweed 10: Sifaat: The Rule of Laam'),
  (11, 'QQQC9ooiXm8', 'Tajweed 11: Sifaat: The Rule of Raa'),
  (12, 'R3D_vnqqTpA', 'Tajweed 12: Sifaat: Qalqala'),
  (13, 'KpDEZZLTkPE', 'Tajweed 13: Sifaat: Common mistakes with Hams'),
  (14, 'P0Y_ZZb3T9g', 'Tajweed 14: Sifaat: Hamzatul wasl'),
  (15, 'pxspBVHr2is', 'Tajweed 15: Sifaat: Meeting of 2 Sukoons'),
  (16, 'IrmQAqrw8UM', 'Tajweed 16: Mudood: Broad categories & key terms'),
  (17, 'N3z5YkZPJnI', 'Tajweed 17: Mudood: Madd Muttasil'),
  (18, 'p_ud9aajAag', 'Tajweed 18: Mudood: Madd Munfasil'),
  (19, 'PcFqrRk0x7Y', 'Tajweed 19: Mudood: Madd ‘Arid lil Sukoon + Speeds of recitation'),
  (20, 'gvzpp5vfu5A', 'Tajweed 20: Mudood: Madd Lāzim'),
  (21, 'zlGzY7gC6E0', 'Tajweed 21: Mudood: Waqf and Ibtidaa''')
) as t(n, youtube_id, title)
where l.series = 'tajweed'
  and l.youtube_id = t.youtube_id
  and l.title like 'Tajweed ' || t.n || ':%'
returning l.title;
