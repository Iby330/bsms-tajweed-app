/**
 * Things that are built but not yet safe to show.
 *
 * PASSWORD_RESET_READY gates the "Forgot password?" link on the sign-in
 * screen. The whole flow works — the email, the token exchange, the new
 * password — but it cannot deliver until the project has custom SMTP, because
 * Supabase's built-in sender "will refuse to deliver messages to addresses
 * that are not part of the project's team" and caps out at two an hour.
 *
 * Left visible, a student would ask for a link, be told one is on its way,
 * and never receive it — a silent failure that generates support messages
 * rather than resets. Hidden, they read "speak to your teacher", which is
 * what actually happens today.
 *
 * TURNED ON 2026-08-16: bsmstajweed.com now sends through Resend (custom
 * SMTP), with the Site URL, Redirect URLs and recovery template in place.
 * A constant rather than an env var on purpose — NEXT_PUBLIC_* values are
 * inlined at build time, so flipping one still needs a redeploy either way,
 * and an unset variable on Netlify is exactly the drift this project has
 * been bitten by before.
 */
export const PASSWORD_RESET_READY = true;
