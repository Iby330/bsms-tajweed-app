-- The waiting list.
--
-- Once sign-ups close, /apply still takes applications, but as the waiting
-- list: people who missed the deadline, to be offered a place if one opens.
-- They have not paid. What they tick instead is agreement to pay the fee if
-- they are offered a place, so paid_confirmed stays false for them and this
-- column is what tells the teacher's board which kind of application it is.
--
-- Set by the server from the clock at the moment of writing (actions.ts),
-- never taken from the form.

alter table applications
  add column if not exists waitlist boolean not null default false;

comment on column applications.waitlist is
  'Applied after sign-ups closed: on the waiting list, not yet offered a place. '
  'Has agreed to pay the fee if offered one, and has not paid it.';
