# Remove a student from the roster

Approved 3 Nov 2026. Mockups: https://claude.ai/artifact/XyTEjxDUE2Ff8C3pqSoP82
("Step by step" page).

## Why

Students leaving or changing class have been handled by one-off migrations
(0096 Alex Sweetman, 0102, 0112 Feras Rashad). Teachers should be able to do it
from My students themselves.

## What teachers see

- Every active student's row on `/teacher/roster` ends in an outlined
  **Remove** button. It sits outside the row's link, so pressing it never opens
  the student record. On a phone it is a slim fifth item on the stats line
  (Rank · Strikes · Hifdh · Overall · Remove); its tap area is padded to 44px.
  To make the room, the phone drops the three strike dots and keeps the
  "0 of 3" figure, which still turns red at two.
- Remove opens a two-choice menu (a bottom sheet on a phone):
  **Move to another class…** and **Leaving the programme…** (red).
- **Move** opens a dialog with a dropdown of the other classes on the student's
  side, labelled `Class · Teacher`, and a **Move to {class}** button.
- **Leaving** opens a red dialog: nothing is deleted, the fee stays recorded,
  they can be placed again from Applications. Button: **Remove {first name}**.
- On success the dialog closes, the row leaves the list, and a dismissible
  confirmation appears at the bottom of the screen. On failure the dialog stays
  open with the reason; nothing changes.

## What happens underneath

One server action, `removeFromClass(studentId, choice)`.

| | application (by `profile_id`) | profile |
|---|---|---|
| Move | `class_id` = new class, `status` = placed | `class_id` = new class, `is_active` = true |
| Leave | `status` = declined | `is_active` = false, `class_id` = null |

- Both stamp `reviewed_by` / `reviewed_at` on the application and add an
  `application_notes` line signed by the teacher ("Moved from Salsabeel to
  Hareer." / "Left the programme (was in Salsabeel)."), so the Applications
  board shows why.
- This is what the board's own `syncAccounts` would do, so the board and the
  roster cannot disagree, and placing someone again on the board reverses a
  leave. Fee, marks, strikes and hifdh are untouched.
- A student with no application (from before the board) gets the profile
  change only.

## Rules

- Teacher: own class only. Admin: any class. Enforced in the action through
  `requireOwnStudent`, not by hiding the button.
- A move must be to a different, existing class on the student's own side
  (brothers/sisters); never to the demo section.
- Only active students show the button.

## Testing

- Unit tests for the pure decision function (`planRemoval`): both outcomes,
  side mismatch, same class, missing class, demo class, note wording.
- Build, lint and the full vitest suite before merging to `main`.
