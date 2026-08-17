-- Stop treating account setup as optional.
--
-- An invitation link does two things: it signs the teacher in, and it shows a
-- form for choosing a password. Nothing tied the two together, so closing the
-- page after the first left an account signed in with a password nobody knew —
-- and /account cannot repair that, because changing a password there verifies
-- the current one by signing in with it. Three of the four teachers invited on
-- 2026-08-16 ended up in exactly that state.
--
-- This flag is what the role layouts check: false means "you have not chosen a
-- password yet", and the app sends them back to /welcome on every page load
-- until they have. Closing the page becomes harmless rather than terminal.
--
-- Default TRUE, deliberately. Every account that already exists — the real
-- students, the demo students, the teachers already set up — has to stay
-- untouched, or the redirect would trap all of them behind a form they have no
-- reason to see. Only an invitation sets it false, in send_invites.ts.
--
-- `add column if not exists` needs no DO block (unlike add constraint), and a
-- non-volatile default does not rewrite the table in Postgres 11+, so this is
-- a catalog-only change on a table the whole app reads.

alter table profiles
  add column if not exists setup_complete boolean not null default true;

comment on column profiles.setup_complete is
  'False only between an invitation being sent and the person choosing their '
  'own password. The role layouts redirect to /welcome while it is false.';
