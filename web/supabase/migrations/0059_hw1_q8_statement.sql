-- Homework 1, Q8: a true/false item written as a question ("Are minor mistakes
-- in recitation deemed Haram?"). Asked to drop the "Are"; it is now the
-- statement students judge. The key (False) and every mark are unchanged.
update questions
   set prompt = 'True or False: Minor mistakes in recitation are deemed Haram.'
 where id = '16a710a1-5a29-403a-a37d-a4ac7d75d0ab'
   and prompt = 'True or False: Are minor mistakes in recitation deemed Haram?'
returning id, prompt;
