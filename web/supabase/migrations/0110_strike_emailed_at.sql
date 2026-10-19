-- When the student was emailed about this strike (lib/strikes/notify.ts).
--
-- Stamped only once Resend has accepted the "you've received a strike"
-- email. Taking a strike back sends a "strike removed" email only when this
-- is set, so a strike from before strike emails existed, one whose email
-- failed, or a demo student's, never produces a correction for a strike the
-- student was never told about.
alter table strikes add column if not exists emailed_at timestamptz;
