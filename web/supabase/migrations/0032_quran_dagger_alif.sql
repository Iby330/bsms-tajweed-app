-- ═══════════════════════════════════════════════════════════════════════
-- Drop the tatweel in front of every dagger alif in the question bank.
--
-- THE DEFECT. Uthmanic Hafs mis-places U+0670 (the dagger alif) when it
-- follows U+0640 (tatweel): it sets the alif adrift to the left, over the
-- letter AFTER the one it lengthens. So جَنَّـٰتٍ draws its alif above the
-- tāʾ rather than the nūn, and a verse reads as though it has a mark in the
-- wrong place — which is exactly what it looks like on screen.
--
-- The tatweel is only a CARRIER. It changes no letter, no rasm and no
-- pronunciation; it exists to give the mark something to sit on. Remove it
-- and Hafs puts the alif exactly where it belongs. This is the same single
-- deviation from the source text that lib/classes/verse.ts and the opening
-- verse on /apply already make, for the same reason and with the same
-- justification: two characters, no change of meaning.
--
-- WHAT IS TOUCHED. Question prompts and option values, which is where the
-- verses live — 22 rows carry the pair. Nothing else: student answers are
-- typed by students and are theirs, and titles carry no Qur'anic text.
--
-- Idempotent: the pattern cannot match once removed, so re-running is a no-op.
-- ═══════════════════════════════════════════════════════════════════════

update questions
   set prompt = replace(prompt, chr(1600) || chr(1648), chr(1648))
 where prompt like '%' || chr(1600) || chr(1648) || '%';

-- options is jsonb, so the swap goes through its text form and back.
update questions
   set options = replace(options::text, chr(1600) || chr(1648), chr(1648))::jsonb
 where options::text like '%' || chr(1600) || chr(1648) || '%';
