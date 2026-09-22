-- No em dashes in programme content.
--
-- House style is now no em dashes anywhere a student or teacher reads. This
-- covers the content the programme authored: lesson titles, a question prompt
-- and the demo class names. It deliberately does NOT touch anything a person
-- wrote or submitted (answers, teachers' notes, finance notes): those are
-- records, not copy.
--
-- Every statement is idempotent: each matches only rows that still contain
-- an em dash, so a re-run changes nothing.

-- "Umm al-Kitab 3 — The Basmala" -> "Umm al-Kitab 3: The Basmala", the colon
-- every other lesson title already uses. Both title parsers (ruleName in
-- lib/lessons/rule-name.ts, moduleTitle in lib/curriculum/tree.ts) accept a
-- colon as well as the dash.
update public.lessons
   set title = replace(title, ' — ', ': ')
 where title like '%—%';

-- The ikhfa' tap question (An-Naba' 12–18).
update public.questions
   set prompt = replace(prompt, ' — so when', ', so when')
 where prompt like '%—%';

-- "Demo — Brothers" -> "Demo: Brothers". execution/setup_demo_teacher.ts finds
-- these classes BY NAME and creates any it cannot find, so its names are
-- changed in the same commit.
update public.classes
   set name = replace(name, ' — ', ': ')
 where name like 'Demo —%';
