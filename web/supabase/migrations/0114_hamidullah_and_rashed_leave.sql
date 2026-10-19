-- Hamidullah Ahmadi (Masjid Al-Umawi) and Rashed Alajmi (Masjid Al-Haram)
-- leave the programme (programme lead, 16 October). Same shape as 0096.
--
-- The profile follows the application (syncAccounts in
-- lib/applications/actions.ts), so each application is declined as the board
-- would decline it, and the account goes inactive: off every register,
-- leaderboard and teacher screen, a locked page if they log in. Their class
-- goes too, so they no longer list in their masjid. Placing them again on the
-- board brings both back.
--
-- Fees are untouched. Neither has a homework extension. Nothing is deleted:
-- accounts, submissions, hearings and marks all stay. Idempotent.

update applications
   set status = 'declined'
 where profile_id in ('d2b024cf-cdce-4e42-b266-071011683582',
                      'd1504c76-59b4-4910-8fdc-5fb7baf94dd5')
returning id, profile_id, status, class_id, fee_settled;

update profiles
   set is_active = false, class_id = null
 where id in ('d2b024cf-cdce-4e42-b266-071011683582',
              'd1504c76-59b4-4910-8fdc-5fb7baf94dd5')
returning id, full_name, is_active, class_id;
