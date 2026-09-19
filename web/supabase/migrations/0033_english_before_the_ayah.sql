-- ═══════════════════════════════════════════════════════════════════════
-- The question comes first, the ayah it asks about comes second.
--
-- THE DEFECT. 0032's sibling change taught <MixedText> that a newline in a
-- prompt is meaningful, so "question\n\nayah" renders as two lines with the
-- verse below. That fixed the 22 prompts written in that order. Two were
-- written the other way round — the verse first, the question underneath —
-- and those now render an ayah above an English sentence, which reads as
-- though the verse is the question and the sentence is a caption.
--
-- Both are in the Ikhfaa paper (positions 6 and 7), both ask "How many
-- instances of Ikhfaa are in this ayah", and in both the student has to read
-- the bottom line before the top one makes sense.
--
-- WHAT IS TOUCHED. Only prompts whose FIRST line starts with an Arabic
-- character and which carry a newline. The regex swaps the head and the tail
-- around the first run of newlines; btrim also drops a trailing space one of
-- the two carried. The 's' flag lets the tail match across newlines so a
-- three-line prompt keeps its remaining structure.
--
-- Nothing else moves: options are untouched (the verses that ARE the answers
-- belong in the option list, not the prompt), marks are untouched, and no
-- answer or submission references prompt text.
--
-- Idempotent: after the swap the first line is English, so the WHERE clause
-- cannot match the same row twice.
-- ═══════════════════════════════════════════════════════════════════════

update questions
   set prompt = regexp_replace(
                  btrim(prompt),
                  '^([^' || chr(10) || ']+)' || chr(10) || '+(.+)$',
                  E'\\2\n\n\\1',
                  's'
                )
 where prompt like '%' || chr(10) || '%'
   and split_part(prompt, chr(10), 1) ~ '^[[:space:]]*[\u0600-\u06FF]'
returning id, position, left(prompt, 60) as now_starts_with;
