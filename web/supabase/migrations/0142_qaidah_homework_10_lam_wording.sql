-- Qāʿidah homework 10 (310, the Az-Zalzalah rule hunt): the lām is tagged on
-- the ل or the letter after it, not "the ال" (Ibrahim, 9 Nov). Wording only:
-- the key still counts a tag on the ٱ. Matches docs/homework-2026-27/final/qaidah-hw10.json.
--
-- Idempotent.

update questions set prompt = $q$Find the rules in Sūrat az-Zalzalah. Tap any letter and choose the rule or rules on it: a letter can carry more than one. For Lām shamsiyyah and Lām qamariyyah, tag the ل or the letter straight after it. Find as many as you can. Each thing you find earns a mark, and each wrong tag cancels one you found.$q$
 where position = 1 and homework_id = (select id from homeworks where number = 310)
returning position, prompt;
