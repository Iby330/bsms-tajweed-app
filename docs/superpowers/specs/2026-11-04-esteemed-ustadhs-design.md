# Esteemed Ustadhs class: design

Date: 2026-11-04
Status: awaiting owner review

## What is being built

A new class, **Esteemed Ustadhs**, taught by Mohamed K El-Bayouk. It lives in the
app but is walled off from the brothers' and sisters' programme.

Its five students are the five brothers' teachers. Each stays a teacher of their
own class and is a student here, on one login:

| Student | Own class | Login |
| --- | --- | --- |
| Ibrahim Ramadan | Masjid Quba | ibyramadan@icloud.com |
| Yunus Zafar | Masjid Al-Haram | yunuszafar786@gmail.com |
| Moadh Hwessa | Masjid Al-Aqsa | hwessa.moadh@gmail.com |
| Daniyal Thakur | Masjid An-Nabawi | danthakr@gmail.com |
| Abdallah Ghouse | Masjid Al-Umawi | a.ghouse373@gmail.com |

The dashboards match the current student and teacher ones for now. Tabs and
content will change later, so nothing here should make that harder.

The class is mainly for two things, and both must work on day one: **Resources**,
for extra content the teachers cover, and **Hifdh revision pairs**, so they can
log each other's recitation and track progress. A reviewer in this class can pick
any surah the app holds, because teachers present portions from anywhere. This
narrows the build to the basics, and the owner approved two profile records under
one login.

## Decisions

- **One login, both roles.** The owner chose this over a second hidden account
  per teacher. See "How one login holds both roles".
- **Each teacher opens on their own class.** A switch moves them into the student
  view. A fresh browser session opens on their own class again.
- **Only these five get the switch.** No other teacher sees the class or the
  switch, including the sisters' teachers.
- **The class starts with no courses or homework.** The tabs exist with their
  empty states, so no deadline, strike or email can fire until content is chosen.

## How one login holds both roles

Every student screen, security rule and leaderboard answers two questions from
the `profiles` row: who is signed in, and what are their role, section and class?
Lists work the same way, finding students by `role` and `class_id`.

Each teacher therefore gets a second `profiles` row, called a **seat**: role
`student`, section `ustadhs`, class Esteemed Ustadhs. A seat has no login, email
or password of its own. It points at the owner's login through a new
`profiles.login_id` column. The person signs in once and acts as either row.

Keeping both roles on a single row was rejected. The roster, register, grading,
hearings and 11 database views all read `role` and `class_id` per person, so a
teacher who is also a student would need every one of those lists rewritten to
understand enrolments. A seat appears in those lists with no changes to them.

### Acting as a seat

A new database function, `acting_id()`, answers "who is this request acting as":

- With no `x-bsms-seat` request header, it returns `auth.uid()`, exactly as today.
- With the header, it returns the seat's id, but only if that seat's `login_id`
  equals `auth.uid()`. Otherwise it returns `auth.uid()`.

A forged header can't reach anyone else's data, because the database checks
ownership itself. Acting as a seat only ever reduces access, from teacher to
student.

Every live security rule and view that reads `auth.uid()` is rewritten to read
`acting_id()`. The live catalog has 50 policies, 11 views and 9 functions using
it. Two functions, `log_finance_change` and `record_fee_deposit`, keep
`auth.uid()` so the finance log always records the real person. A seat is a
student, so it can't call them anyway.

`is_teacher()` is one of the rewritten functions, so every rule built on it
follows automatically.

The rewrite reads the live catalog as it applies, in one transaction, so a
recent migration from another session can't be overwritten by stale text. A
before-and-after comparison of what each kind of user can see confirms nothing
moved. Storage rules stay on `auth.uid()`: avatars belong to the login, and seats
record no voice notes yet.

**Kill switch:** if anything misbehaves, redefining `acting_id()` as
`select auth.uid()` restores today's behaviour immediately, with no deploy.

### Schema

- `section_t` gains `ustadhs`, in its own migration, because Postgres can't use a
  new enum value in the batch that adds it.
- `profiles.login_id uuid null`, referencing `auth.users` with cascade delete,
  and unique so a login has at most one seat.
- `profiles_id_fkey` is dropped, because a seat's id has no `auth.users` row. An
  after-delete trigger on `auth.users` keeps the old cascade for normal profiles.
- A trigger copies `full_name` and `avatar_url` from a teacher's profile to their
  seat, so both show the same name and picture.

### In the app

- **Cookie:** `bsms_seat` is a session cookie with no expiry, so closing the
  browser returns the person to their own class. It selects a view and grants
  nothing, because the database makes the decision.
- **Clients:** `supabaseServer()` and `supabaseBrowser()` send `x-bsms-seat` when
  the cookie is set. The browser client reads the cookie on each request, so a
  switch takes effect without a page reload.
- **`currentProfile()`:** returns the seat when the cookie names a valid one, so
  layouts and pages behave as they would for any student.
- **The switch:** a server action checks the seat belongs to this login, sets or
  clears the cookie and redirects to `/home` or `/teacher/home`. It appears in
  the shell on desktop and on phones, only for logins with a seat.
- **Places that need the login rather than the seat:**
  - Email lookups in `strikes/notify.ts` and `marking/notify.ts` use
    `login_id ?? id`, so a seat's email reaches the real person.
  - `/account` always manages the login's own profile.

## Mohamed

He has one account and needs no seat. His section moves from `brothers` to
`ustadhs`, and he becomes the class's `teacher_id`. Because he owns it, this class
is what he opens on.

He stays an admin, so he can still open every class from the Classes page. His
home and roster show only this class rather than all classes. He has never
signed in, so no working habit is disturbed.

## Keeping the class separate

Adding a section isn't enough. These places treat "not demo" as "the real
programme", so each must also exclude `ustadhs`:

| Where | Risk if missed |
| --- | --- |
| `v_lb_individual_all`, `v_lb_hifz_class_all` (0021) | Ustadhs on real students' programme-wide leaderboards |
| `teacher/roster/page.tsx` | Class offered in the teachers' "move student" list |
| `applications/queries.ts` | Class offered when placing applicants |
| `deposits/queries.ts` | Ustadhs in the deposit ledger |
| `teacher/scope.ts`: `teacherClasses`, `canOpenSection` | Class in the admin and class filters |
| `execution/send_invites.ts` | Wrong student counts in admin invites |

One screen needs the opposite change. `teacher/classes/page.tsx` lists only
brothers and sisters unless the viewer is in demo, so it must add `ustadhs` for
Mohamed or he won't see his own class there.

A single `PROGRAMME_SECTIONS` constant replaces the scattered `"demo"` checks.
Viewers in `ustadhs` see only `ustadhs` on those boards, mirroring how demo works,
and their home pages hide the cross-programme board.

The section also needs a calendar entry, because `SECTION_TIMETABLES` must cover
every section. It copies the brothers' Monday and Thursday as a placeholder, and
real days can replace it later. `section_weeks` needs no rows, because sections
without an override use the standard weeks.

As with the rest of the app, teacher separation is scoping and not a security
boundary: the existing rules let any teacher read across sections, and that
doesn't change here. Screens will not offer the class to other teachers, but this
doesn't stop a teacher reaching its data directly through the database API.

## Release order

There is no local database, so localhost reads and writes the live one. The class
can't exist until live code knows to hide it.

1. **Release A, no visible change.** Push the `PROGRAMME_SECTIONS` filters and
   the enum, then apply the view fixes and the `acting_id()` rewrite. Verify.
2. **Data.** Create the class, the five seats and Mohamed's change. Live code
   hides all of it.
3. **Localhost preview.** The owner tries the switch and both views and approves.
4. **Release B.** Push the switch UI to `main`.
5. **Mohamed's login email.** Send it with `send_invites.ts --email`, after a dry
   run. It's a one-time link to set his password and uses the normal teacher copy
   naming this class. Send it when he's likely to act on it, because the link
   expires.

Release A goes to `main` without an owner preview because nothing changes on
screen.

## Testing

- **Before and after the rewrite:** for a real student, a teacher and the admin,
  run row counts across every policy-protected table and view in a rolled-back
  transaction with their claims set. Counts must match exactly.
- **Seat isolation:** in the same way, confirm:
  - A seat sees only its own work and the ustadhs board.
  - A login's header can't act as another login's seat.
  - Real students never see a seat on any board.
- **Unit tests:** `acting_id` routing in `currentProfile`, the switch action's
  ownership check and `PROGRAMME_SECTIONS` filtering.
- **Build:** `npm run build` and tests before each push.
- **Browser check:** teacher to student and back, a fresh session opening on the
  teacher's own class, a voice note saved as a seat, and a phone-width pass.

## Risks

- **The rewrite touches every rule live students depend on.** This is the main
  risk of the one-login choice. The mitigations are the generated diff, the
  before-and-after counts, the single transaction and the kill switch.
- **Speed.** `acting_id()` adds a little work per call. With no header it only
  reads a request setting, so it should be close to free, but home page timing is
  measured before and after Release A.
- **Future code.** New rules must use `acting_id()` rather than `auth.uid()`, or
  they will behave wrongly for seats. This is added to the directives and
  `LEARNINGS.md`.
- **Other sessions.** `main` moves often and migration numbers may collide, so
  each release rebases and renumbers first.

## Out of scope

The new tabs and dashboards, the class's content and timetable, and seats for
anyone outside the five named here.
