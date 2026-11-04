-- The quran.com feed files one word on the wrong line on two pages seeded for
-- the ustadhs' full mushaf. Each shows as one line about 1.3-2.8em too wide above
-- one too short by the same amount, and moving the word brings both to the page's
-- usual measure. Re-running seed_quran_words.ts on these pages undoes this.
update quran_words set line_number = 12
 where page_number = 177 and surah_number = 8 and ayah_number = 6 and word_position = 10 and line_number = 11;
update quran_words set line_number = 13
 where page_number = 443 and surah_number = 36 and ayah_number = 52 and word_position = 11 and line_number = 12;
select page_number, line_number from quran_words
 where (surah_number, ayah_number, word_position) in ((8, 6, 10), (36, 52, 11));
