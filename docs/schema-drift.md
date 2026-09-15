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

## 4. `lib/curriculum/syllabus.ts` is a second, name-keyed copy of the syllabus

~~Dead code.~~ **Wrong — corrected 2026-09-15.** The original note here said
nothing imported this file. It does: `plan.ts` imports it as `./syllabus`, and
the grep behind the claim only looked for the `@/lib/curriculum/syllabus`
alias. `plan.ts` drives both calendar screens and `lib/marking/actions.ts`, so
the file is very much live. The lesson is the smaller one: a relative import is
invisible to a search for the aliased path.

The real drift is subtler than a dead file, and worse.
`0026_courses_and_class_syllabus.sql` copied `SYLLABUS` and `CLASS_GROUP` into
`courses` and `class_courses`, because RLS cannot read a TypeScript file. It
did not replace them. So the same syllabus is now stated twice:

| | keyed by | drives | survives a class rename |
| --- | --- | --- | --- |
| `class_courses` | class **id** | RLS, the course index | yes |
| `syllabus.ts` `CLASS_GROUP` | class **name** | both calendar screens | **no** |

A class rename therefore half-works: the database copy follows the row, and
the TypeScript copy silently stops matching. It does not throw — `CLASS_GROUP`
simply returns no group, and that class's calendar renders its teaching days
with no topics on them.

This is not hypothetical. `0029_real_classes_for_groups_3_and_4.sql` renamed
two classes on 2026-09-15 and had to edit `syllabus.ts` in the same commit to
keep the calendars working.

**To fix:** have `plan.ts` read `class_courses` like everything else, and
delete `CLASS_GROUP`. Until then, treat "rename a class" as a change that
touches the database *and* this file, and never only one.
