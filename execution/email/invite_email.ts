/**
 * The invitation email, in the app's own colours.
 *
 * Written as tables with inline styles because that is what email clients
 * actually render — Outlook still uses Word's engine, and Gmail strips
 * <style> blocks in some contexts. Nothing here loads from a stylesheet.
 *
 * The palette is lifted from web/src/app/globals.css so the mail and the app
 * are visibly the same product:
 *   page cream  #f4f1df   card  #fbf9ee   ink   #14140f
 *   border      #ded9bf   muted #5c5949   ochre #6e6010
 *
 * The logo is the deployed one rather than an attachment: a remote image can
 * be blocked by the client, and a CID attachment trips some spam filters. It
 * sits on a black band, which is also the logo's own background, so a blocked
 * image degrades to a black bar with alt text rather than a broken frame.
 */

const SITE = "https://bsms-tajweed.netlify.app";
const LOGO = `${SITE}/brand/logo.png`;

/**
 * How long the link in this email actually lasts.
 *
 * This is NOT set here — it mirrors "Email OTP Expiration" under
 * Authentication → Sign In / Providers → Email in the Supabase dashboard,
 * which is the only thing that decides when a token dies. The number lives in
 * one place so the promise in the email cannot quietly drift from the truth:
 * a message claiming 24 hours while tokens expire in one is worse than saying
 * nothing, because the teacher stops trusting the link rather than retrying.
 *
 * Supabase caps this at 86400 seconds. If that setting is ever lowered, lower
 * this to match on the same day.
 */
const LINK_VALID_HOURS = 24;
const validFor = LINK_VALID_HOURS === 1 ? "about an hour" : `${LINK_VALID_HOURS} hours`;

export type Invite = {
  firstName: string;
  className: string;
  studentCount: number;
  section: "brothers" | "sisters";
  /** the one-time link that signs them in and lands on /welcome */
  link: string;
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function inviteSubject(): string {
  return "Your BSMS Tajweed account is ready";
}

/**
 * Plain-text alternative. Not optional: a message with no text/plain part
 * scores worse with spam filters, and some people genuinely read mail this way.
 */
export function inviteText(i: Invite): string {
  return [
    `Assalamu alaikum ${i.firstName},`,
    ``,
    `Your teacher account on BSMS Tajweed is ready. ${i.className} is already`,
    `set up with your ${i.studentCount} students, their homework and their hifdh records.`,
    ``,
    `Set your password and finish setting up here:`,
    i.link,
    ``,
    `This link works once and expires after ${validFor}. If it has run out by`,
    `the time you open it, go to ${SITE}/forgot-password`,
    `and enter this address — that sends you a fresh one.`,
    ``,
    `You did not need to sign up: the account already exists and is waiting`,
    `for you. Nobody else can see this link.`,
    ``,
    `— BSMS Tajweed`,
  ].join("\n");
}

export function inviteHtml(i: Invite): string {
  const name = esc(i.firstName);
  const cls = esc(i.className);
  const link = esc(i.link);
  const people = i.studentCount === 1 ? "1 student" : `${i.studentCount} students`;
  const sectionLabel = i.section === "brothers" ? "Brothers" : "Sisters";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<!-- Tells clients this design is light-only, so none of them auto-invert it
     into a colour scheme the brand does not have. -->
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(inviteSubject())}</title>
</head>
<body style="margin:0;padding:0;background:#f4f1df;">

<!-- Preheader: the grey line of text a client shows next to the subject.
     Left empty it would scrape the first words of the markup instead. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">
  ${cls} is set up with your ${people}. Set your password to get in.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background:#f4f1df;margin:0;padding:0;">
  <tr>
    <td align="center" style="padding:32px 12px;">

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
             style="width:100%;max-width:600px;background:#fbf9ee;border:1px solid #ded9bf;border-radius:14px;overflow:hidden;">

        <!-- brand band ------------------------------------------------- -->
        <tr>
          <td align="center" style="background:#000000;padding:28px 24px;">
            <img src="${LOGO}" width="104" height="104" alt="BSMS Tajweed"
                 style="display:block;border:0;outline:none;text-decoration:none;width:104px;height:104px;">
          </td>
        </tr>

        <!-- body ------------------------------------------------------- -->
        <tr>
          <td style="padding:34px 34px 8px 34px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
            <p style="margin:0 0 18px 0;font-size:17px;line-height:1.5;color:#14140f;">
              Assalamu alaikum ${name},
            </p>
            <p style="margin:0 0 16px 0;font-size:16px;line-height:1.65;color:#14140f;">
              Your teacher account is ready. You don&rsquo;t need to sign up &mdash;
              it already exists and is waiting for you.
            </p>
          </td>
        </tr>

        <!-- the class, stated plainly so it is obviously not a mailshot -->
        <tr>
          <td style="padding:6px 34px 0 34px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                   style="background:#f4f1df;border:1px solid #ded9bf;border-radius:10px;">
              <tr>
                <td style="padding:18px 20px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
                  <div style="font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#6e6010;font-weight:700;">
                    Your class
                  </div>
                  <div style="font-size:21px;line-height:1.3;color:#14140f;font-weight:700;padding-top:6px;">
                    ${cls}
                  </div>
                  <div style="font-size:14px;line-height:1.5;color:#5c5949;padding-top:4px;">
                    ${people} &middot; ${sectionLabel}
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:20px 34px 0 34px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
            <p style="margin:0;font-size:16px;line-height:1.65;color:#14140f;">
              Last year&rsquo;s register, homework and hifdh records are already in
              there, so you can look around properly rather than at an empty shell.
            </p>
          </td>
        </tr>

        <!-- call to action. A table, not a padded <a>: Outlook ignores
             padding on anchors and the button collapses to bare text. -->
        <tr>
          <td align="center" style="padding:28px 34px 6px 34px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" bgcolor="#14140f" style="border-radius:9px;">
                  <a href="${link}"
                     style="display:inline-block;padding:15px 34px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;color:#f4f1df;text-decoration:none;border-radius:9px;">
                    Set up your account
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:14px 34px 0 34px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
            <p style="margin:0;font-size:13px;line-height:1.6;color:#5c5949;text-align:center;">
              You&rsquo;ll choose your own password. Adding a photo is optional.
            </p>
          </td>
        </tr>

        <!-- the honest small print -------------------------------------- -->
        <tr>
          <td style="padding:24px 34px 0 34px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                   style="border-top:1px solid #ded9bf;">
              <tr>
                <td style="padding-top:18px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
                  <p style="margin:0 0 12px 0;font-size:13px;line-height:1.6;color:#5c5949;">
                    <strong style="color:#14140f;">The link works once and runs out after ${validFor}.</strong>
                    If it has expired by the time you open this, go to
                    <a href="${SITE}/forgot-password" style="color:#6e6010;text-decoration:underline;">${SITE.replace("https://", "")}/forgot-password</a>
                    and enter this address &mdash; that sends a fresh one straight away.
                  </p>
                  <p style="margin:0;font-size:12px;line-height:1.6;color:#5c5949;">
                    Button not working? Copy this in:<br>
                    <span style="word-break:break-all;color:#6e6010;">${link}</span>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr><td style="padding:26px;"></td></tr>
      </table>

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
             style="width:100%;max-width:600px;">
        <tr>
          <td align="center" style="padding:18px 24px 0 24px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
            <p style="margin:0;font-size:12px;line-height:1.6;color:#5c5949;">
              BSMS Tajweed &middot; sent because you teach on the programme.<br>
              Not expecting this? Reply and tell us &mdash; don&rsquo;t use the link.
            </p>
          </td>
        </tr>
      </table>

    </td>
  </tr>
</table>
</body>
</html>`;
}
