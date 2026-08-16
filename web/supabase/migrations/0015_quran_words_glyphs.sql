-- quran_words: per-word QCF v1 glyph (King Fahd Complex per-page fonts, cut
-- from the 1405 Madani mushaf). One character in the page's own font — the
-- reader renders these for a print-identical page; text_uthmani stays for
-- search, letters and fallback.
alter table quran_words add column if not exists code_v1 text;
