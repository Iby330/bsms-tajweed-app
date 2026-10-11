-- Homework 2, Q6: ٱلنَّفَّـٰثَـٰتِ was stored with a tatweel before each small
-- alif (U+0640 U+0670). Uthmanic Hafs draws the second one after the ت rather
-- than before it. Without the tatweels (ٱلنَّفَّٰثَٰتِ) both alifs sit on their
-- letters, checked by rendering the two side by side in the app's font.
update questions
   set prompt = replace(prompt, U&'\0640\0670', U&'\0670')
 where id = 'ce34d153-ef5d-466f-af54-1961ab6298ce'
   and prompt like '%' || U&'\0640\0670' || '%'
returning id, prompt;
