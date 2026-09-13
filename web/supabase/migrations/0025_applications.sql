-- ═══════════════════════════════════════════════════════════════════════
-- Applications — the sign-up form on our own domain.
--
-- This replaces the Google Form that ran the last four intakes. The questions
-- are carried over as they were asked, with two substitutions and one
-- addition, so that this year's answers can still be read next to last
-- year's:
--
--   * "Where did you get access to this link?" became "Where did you hear
--     about BSMS Tajweed?" — the old wording only ever described the last hop
--     (Whatsapp / Instagram), which is the channel the link travelled on
--     rather than how anybody found the programme.
--   * "What are you hoping to gain from this course?" became "What made you
--     want to join?".
--   * EMAIL IS NEW, and it is the one field the old form never collected.
--     Every account in this app is an email address, so without it an
--     accepted applicant cannot be invited without chasing them by phone.
--
-- WHAT THIS TABLE IS NOT: it is not an account. Nothing here touches
-- auth.users. An application is a person who has asked to join and paid the
-- fee; they are invited to an online session, they recite, they are placed in
-- a group by level, and only then is an account created through the existing
-- invitation flow. `status` tracks exactly that journey and nothing else.
--
-- WHO CAN SEE IT: teachers, via RLS, and nobody else. There is deliberately
-- NO insert policy for `anon`. The form posts to a server action which writes
-- with the service-role key, so the public never holds a grant on this table
-- at all — an applicant cannot read back the roster of who else applied, and
-- cannot write a row with a status already set to 'placed'. See
-- lib/applications/actions.ts.
--
-- Every statement is idempotent so a half-applied batch can be re-run.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. The workflow states ───────────────────────────────────────────────
--
-- Five, and they are the real steps rather than a generic pending/approved
-- pair: the recitation session sits in the middle of this process and the
-- whole point of the screen is knowing who still has to be heard.
--
--   new       submitted the form; nothing has happened yet
--   invited   sent the link to the online recitation session
--   assessed  has recited — `assessed_level` says what was heard
--   placed    put into a class; from here they get an account
--   declined  not going ahead, whichever side decided it
--
-- They are not strictly ordered and nothing enforces a path. Someone can be
-- heard without ever being formally "invited" (they turned up), and anybody
-- can be declined from any state.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'application_status_t') then
    create type application_status_t as enum ('new','invited','assessed','placed','declined');
  end if;
end $$;

-- ── 2. The applications themselves ───────────────────────────────────────
create table if not exists applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- ── who they are ──
  first_name text not null,
  surname text not null,
  email text not null,
  phone text not null,

  -- The form asks gender, because that is the question an applicant can
  -- answer about themselves; what the programme needs is which side they
  -- join, and the two are the same fact here. Storing the side rather than
  -- the gender means the teacher screen, the recitation sessions and an
  -- eventual profile all key off one column that already exists everywhere
  -- else in this schema.
  --
  -- `demo` is a member of section_t (migration 0020) but is a training cohort,
  -- not a side of the programme — an application must never land in it.
  section section_t not null check (section in ('brothers','sisters')),

  -- ── where they're from ──
  -- Free text rather than enums: both questions offer an "Other" box, and
  -- pinning the options into the type system would mean a migration every
  -- time a new university or a new answer turns up. The app owns the list of
  -- choices (lib/applications/form.ts); the database records what was said.
  university text not null,
  year_of_study text not null,

  -- ── where they are with the Qur'an ──
  enrolled_before boolean not null,
  memorised text not null,
  arabic_reading text not null,
  tajweed_level text not null,

  -- ── the two questions this year adds ──
  heard_from text not null,
  motivation text not null,

  -- ── the fee ──
  -- Recorded in pence, on the row, rather than read from a constant at
  -- display time. The fee was £10 for the 2025/26 intake and is £20 for
  -- 2026/27; an application should always be able to say what it was asked
  -- to pay, and changing next year's price must not rewrite this year's
  -- history.
  --
  -- `paid_confirmed` is the applicant TICKING A BOX to say they have paid
  -- through the link. It is a declaration, not a receipt — no payment
  -- provider is involved and nothing verifies it. Reconciliation is by hand,
  -- which is why `fee_settled` exists separately for a teacher to set once
  -- the money is actually seen.
  fee_pence int not null check (fee_pence >= 0),
  paid_confirmed boolean not null default false,
  fee_settled boolean not null default false,

  -- ── the teacher's side of it ──
  status application_status_t not null default 'new',
  -- What was heard at the recitation session, in whatever words are useful.
  -- Free text on purpose: the groups are decided by listening to everyone and
  -- then drawing the lines, so a fixed scale here would be a guess made
  -- before the information exists.
  assessed_level text,
  class_id uuid references classes(id),
  notes text,
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz
);

-- One application per email address.
--
-- Lower-cased because Someone@gmail.com and someone@gmail.com are one person
-- and would otherwise both sit in the list waiting to be contacted. The form
-- catches the collision and says so plainly rather than silently overwriting
-- what was submitted first — by the time a duplicate arrives the original may
-- already carry notes from a recitation session, and an accidental second
-- submission must not erase them.
create unique index if not exists applications_email_key on applications (lower(email));

-- The screen opens on the newest first and filters by side and by state;
-- these are the two orders it actually asks for.
create index if not exists applications_created_idx on applications (created_at desc);
create index if not exists applications_status_idx on applications (section, status);

comment on table applications is
  'Sign-ups from /apply. NOT accounts — an accepted applicant is invited to an '
  'online recitation session, placed in a group by level, and only then given '
  'a login through the normal invitation flow.';
comment on column applications.section is
  'Which side of the programme, derived from the gender answered on the form.';
comment on column applications.paid_confirmed is
  'The applicant''s own tick that they paid through the link. Not verified by '
  'anything; use fee_settled for money actually received.';
comment on column applications.fee_pence is
  'What this application was asked to pay, in pence. £10 in 2025/26, £20 in '
  '2026/27 — kept per row so a future price change cannot rewrite history.';

-- ── 3. RLS ───────────────────────────────────────────────────────────────
--
-- Teachers only, matching every other table in this schema. There is no
-- student policy because a student has no business here, and — said again
-- because it is the security boundary of a page open to the whole internet —
-- no `anon` policy: the public path in and out of this table is the server
-- action, never PostgREST.
alter table applications enable row level security;

drop policy if exists t_applications on applications;
create policy t_applications on applications
  for all using (is_teacher()) with check (is_teacher());
