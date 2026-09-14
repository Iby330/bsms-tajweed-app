# Schema drift — the repo and the database disagree

Three things the live Supabase project has that this repository does not
describe, or describes wrongly. None of them breaks anything today; all three
will mislead somebody reading the repo to work out what the database does.
Found and verified against the live project on **2026-09-14**.

---

## 1. `0023_unlock_all.sql` is applied in production but untracked in git

`web/supabase/migrations/0023_unlock_all.sql` exists on disk, has been applied
to the live database, and has never been committed. It is the only untracked
migration in the folder.

It is not a small one. It adds `profiles.unlock_all`, the helper
`sees_all_content()`, and rewrites `s_lessons_unlocked`, `s_homeworks_unlocked`
and `get_homework_for_student()` around it — so a clone of this repository
cannot reproduce the production schema, and `0027_syllabus_visibility.sql`,
which is committed, calls a function whose definition is missing.

How it was confirmed applied: `profiles.unlock_all` is `true` for Adam
Whitfield in the live table, `sees_all_content()` answers over PostgREST, and
`0027`'s committed policies reference it.

**To fix:** commit the file. The number is not the problem — see §3 — so it
does not need renumbering; it needs to be in git.

## 2. `database.types.ts` predates `0027`

`can_see_content(uuid, int, uuid)` is absent from
`web/src/lib/database.types.ts`, while `class_item_unlock_at` from `0026` is
present. The types were regenerated between the two migrations and not since.

Harmless right now only because nothing in the app calls `can_see_content`
directly — it is invoked from inside the RLS policies. It becomes a real
problem the moment somebody wants to call it, or reads the types file to find
out whether `0027` shipped. (I did exactly that, and concluded wrongly; the
function is live. Verified by calling it with real arguments.)

**To fix:** regenerate the types from the live project.

## 3. Duplicate migration numbers are the norm here, not an accident

Six numbers are used twice: `0015`, `0016`, `0023`, `0024`, `0025`, `0026`.
They come from two people writing migrations against the same base at the same
time, and every one of them is applied.

Worth writing down because it looks like a bug and is not, and because it
means **the ordering in this folder is by name, not by intent**. Anything that
starts applying migrations in filename order — a fresh-clone bootstrap, a CI
check — has to cope with `0023_teaching_calendar.sql` and
`0023_unlock_all.sql` being unordered with respect to each other.

**To fix, if it is ever worth fixing:** a `schema_migrations`-style ledger,
or renumber on merge. Not urgent while migrations are applied by hand.

## 4. `lib/curriculum/syllabus.ts` is dead

`0026_courses_and_class_syllabus.sql` moved `SYLLABUS` and `CLASS_GROUP` into
the `courses` and `class_courses` tables, because RLS cannot read a TypeScript
file. The file was left in place and nothing in `web/src` imports it any more
except its own test — the per-class curriculum is now read from the database
by `getClassSchedule()`.

It is a live hazard rather than clutter: it still reads like the source of
truth, still lists the 2026/27 levelling, and the database has since moved on
from it (Masjid Al-Aqsa's Term 2, for one).

**To fix:** delete `syllabus.ts` and `syllabus.test.ts`, or reduce the file to
the seed data `0026` was written from with a comment saying so.
