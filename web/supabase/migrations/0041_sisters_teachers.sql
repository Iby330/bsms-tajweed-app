-- The sisters' classes go to their real teachers, and the demo teachers go.
--
-- Hareer and Salsabeel were still held by the demo accounts iman@ and
-- maryam@bsms-demo.test, while Sajeda and Rezarta sat in demo-section
-- classes made for their walkthrough. Sajeda takes Hareer and Rezarta
-- Salsabeel, in the demo teachers' order. Both move to the sisters section:
-- teacherClasses() lists a teacher's own section, so in `demo` they would see
-- only demo classes.
--
-- `classes.teacher_id` is the source of truth (lib/teacher/scope.ts) and is
-- read with maybeSingle, so the demo classes let go of them — owning two
-- classes would break their home page.
--
-- The four demo teacher logins (iman@, maryam@, yunus@bsms-demo.test and
-- ibrahim@bsms.demo.test) were banned in Auth on 2026-10-02 — the last still
-- opened with the password committed in seed_demo.ts, in a public repo, as a
-- brothers teacher with no class, which reads every brothers record. Here
-- their profiles go inactive and classless too; the demo purge removes them.

update classes set teacher_id = null
where teacher_id in (select id from auth.users where email in
  ('sajedasufizada24@gmail.com', 'rezartabeka@outlook.com',
   'iman@bsms-demo.test', 'maryam@bsms-demo.test'));

update classes c set teacher_id = u.id
from auth.users u
where (c.name, u.email) in (('Hareer', 'sajedasufizada24@gmail.com'),
                            ('Salsabeel', 'rezartabeka@outlook.com'));

update profiles p set section = 'sisters', class_id = c.id
from auth.users u, classes c
where u.id = p.id and c.teacher_id = p.id
  and u.email in ('sajedasufizada24@gmail.com', 'rezartabeka@outlook.com');

update profiles p set is_active = false, class_id = null
from auth.users u
where u.id = p.id and p.role = 'teacher'
  and u.email in ('iman@bsms-demo.test', 'maryam@bsms-demo.test',
                  'yunus@bsms-demo.test', 'ibrahim@bsms.demo.test');
