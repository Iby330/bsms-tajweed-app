-- quran_words: QPC V2 glyphs (1421H print) alongside the V1 column. The
-- school's mushaf is the 1421H Madani print, so V2 is what the reader
-- renders; code_v1 stays as data — switching editions is a column choice,
-- not a reseed.
alter table quran_words add column if not exists code_v2 text;
