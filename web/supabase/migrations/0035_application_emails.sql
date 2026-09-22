-- ═══════════════════════════════════════════════════════════════════════
-- Applications: the two emails, and the account a placement turns into.
--
-- Until now an application stopped at 'placed' — a decision on a board with
-- nothing downstream of it. This adds the three facts the next step needs:
--
--   confirmation_sent_at  the "your application is in" email went out. Null
--                         means it did not (no key set, or Resend refused),
--                         which is a person worth messaging by hand.
--   profile_id            the account made from this application, once the
--                         login email has been sent. Set once and kept: a
--                         later class move or a decline acts on this profile
--                         rather than making a second one.
--   login_sent_at         when the most recent login email went out. Resending
--                         moves it; it never goes back to null.
--
-- Every statement is idempotent so a half-applied batch can be re-run.
-- ═══════════════════════════════════════════════════════════════════════

alter table applications
  add column if not exists confirmation_sent_at timestamptz,
  add column if not exists profile_id uuid references profiles(id) on delete set null,
  add column if not exists login_sent_at timestamptz;

comment on column applications.confirmation_sent_at is
  'When the confirmation email went out. Null = it did not; contact them by hand.';
comment on column applications.profile_id is
  'The student account created from this application by "Send login".';
comment on column applications.login_sent_at is
  'When the latest login email was sent. Moves on resend.';
