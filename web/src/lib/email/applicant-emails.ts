import { fmtDay } from "@/lib/format";
import { TERMS } from "@/lib/attendance/calendar";
import { VENUE } from "@/lib/applications/form";

/**
 * The two emails an applicant gets: "your application is in", sent the moment
 * the form is submitted, and "you're in", sent when a teacher presses Send
 * login after placing them in a class.
 *
 * Pure functions with no database and no network, so they can be tested and
 * previewed directly. They carry the look of the teacher invitation
 * (execution/email/invite_email.ts) so everything from the programme reads as
 * one product.
 *
 * Tables and inline styles only, because that is what email clients render:
 * Outlook still uses Word's engine, and Gmail strips <style> in places.
 *
 * DELIVERABILITY, which is mostly decided elsewhere (DKIM/SPF/DMARC on the
 * domain; see lib/email/send.ts). What the body contributes: every link points
 * at bsmstajweed.com or a well-known host (WhatsApp, the payment page) and is
 * written out in full, never shortened; there are at most three of them; the
 * message is mostly text rather than one big image; and there is always a
 * plain-text part alongside the HTML.
 *
 * No em dashes anywhere a user reads (house style, see migration 0034).
 */

export const SITE = "https://www.bsmstajweed.com";
const LOGO = `${SITE}/brand/logo-navy.png`;

/** Mirrors "Email OTP Expiration" in the Supabase dashboard, as the teacher
 *  invite does. If that setting changes, change this with it. */
const LINK_VALID_HOURS = 24;

/** The brand's three colours (docs/brand-system.md) and their checked
 *  text/border steps. Light only: the shell declares color-scheme light. */
const C = {
  page: "#e5e5ff", card: "#ffffff", ink: "#00004d",
  border: "#c8c8dc", muted: "#58586d",
  sage: "#b2c58c", sageText: "#404d1f",
} as const;
const FONT = "'Helvetica Neue',Helvetica,Arial,sans-serif";

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Side = "brothers" | "sisters";
const sideLabel = (s: Side) => (s === "brothers" ? "Brothers" : "Sisters");

/* ── Building blocks ──────────────────────────────────────────────────── */

const para = (html: string, size = 16) =>
  `<p style="margin:0 0 16px 0;font-size:${size}px;line-height:1.65;color:${C.ink};">${html}</p>`;

const row = (html: string, pad = "0 34px") =>
  `<tr><td style="padding:${pad};font-family:${FONT};">${html}</td></tr>`;

/** A table, not a padded <a>: Outlook ignores padding on anchors and the
 *  button collapses to bare text. */
function button(href: string, label: string, tone: "ink" | "sage" = "ink") {
  // Sage is the accent, and a sage fill always carries navy type (10.17:1).
  const bg = tone === "sage" ? C.sage : C.ink;
  const fg = tone === "sage" ? C.ink : C.page;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px 0;">
  <tr><td align="center" bgcolor="${bg}" style="border-radius:9px;">
    <a href="${esc(href)}" style="display:inline-block;padding:14px 30px;font-family:${FONT};font-size:16px;font-weight:700;color:${fg};text-decoration:none;border-radius:9px;">${label}</a>
  </td></tr>
</table>`;
}

/** The tinted panel the class or the application summary sits in. */
function panel(kicker: string, title: string, sub: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background:${C.page};border:1px solid ${C.border};border-radius:10px;margin:0 0 22px 0;">
  <tr><td style="padding:18px 20px;font-family:${FONT};">
    <div style="font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:${C.sageText};font-weight:700;">${kicker}</div>
    <div style="font-size:21px;line-height:1.3;color:${C.ink};font-weight:700;padding-top:6px;">${title}</div>
    <div style="font-size:14px;line-height:1.5;color:${C.muted};padding-top:4px;">${sub}</div>
  </td></tr>
</table>`;
}

/** Numbered steps, as a table so the numbers line up in every client. */
function steps(items: [string, string][]) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px 0;">
${items.map(([title, body], i) => `  <tr>
    <td valign="top" width="36" style="padding:0 0 14px 0;">
      <div style="width:26px;height:26px;line-height:26px;border:1px solid ${C.border};border-radius:13px;text-align:center;font-family:${FONT};font-size:12px;color:${C.muted};">${i + 1}</div>
    </td>
    <td valign="top" style="padding:2px 0 14px 0;font-family:${FONT};">
      <div style="font-size:15px;font-weight:700;color:${C.ink};">${title}</div>
      <div style="font-size:14px;line-height:1.55;color:${C.muted};padding-top:2px;">${body}</div>
    </td>
  </tr>`).join("\n")}
</table>`;
}

const heading = (text: string) =>
  `<div style="font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:${C.sageText};font-weight:700;margin:6px 0 12px 0;">${text}</div>`;

function shell(o: { title: string; preheader: string; body: string; footer: string }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(o.title)}</title>
</head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${o.preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page};margin:0;padding:0;">
  <tr><td align="center" style="padding:32px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
           style="width:100%;max-width:600px;background:${C.card};border:1px solid ${C.border};border-radius:14px;overflow:hidden;">
      <tr><td align="center" style="background:${C.ink};padding:28px 24px;">
        <img src="${LOGO}" width="96" height="96" alt="BSMS Tajweed"
             style="display:block;border:0;outline:none;text-decoration:none;width:96px;height:96px;">
      </td></tr>
      <tr><td style="height:30px;line-height:30px;font-size:0;">&nbsp;</td></tr>
${o.body}
      <tr><td style="height:18px;line-height:18px;font-size:0;">&nbsp;</td></tr>
    </table>
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
      <tr><td align="center" style="padding:18px 24px 0 24px;font-family:${FONT};">
        <p style="margin:0;font-size:12px;line-height:1.6;color:${C.muted};">${o.footer}</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/* ── 1. Your application is in ────────────────────────────────────────── */

export type Confirmation = {
  firstName: string;
  section: Side;
  phone: string;
  feeLabel: string;
  paidConfirmed: boolean;
  /** Null until supplied in form.ts; the email then says we'll message them. */
  whatsappLink: string | null;
  paymentLink: string | null;
};

export const confirmationSubject = () => "Your BSMS Tajweed application is in";

/** What the fee paragraph says, which depends on where payment is up to. */
function feeLine(c: Confirmation): string {
  if (c.paidConfirmed) {
    return `You told us you've paid the ${c.feeLabel} fee. We'll mark it as received once we see it come in.`;
  }
  if (c.paymentLink) {
    return `The fee is ${c.feeLabel}, once, for the whole year. If you haven't paid it yet, you can do that here:`;
  }
  return `The fee is ${c.feeLabel}, once, for the whole year. We'll send you the payment details separately.`;
}

const nextSteps = (): [string, string][] => [
  ["Read for us",
    "A short online session where you recite a passage. It is not a test and there is nothing to revise. We just need to hear where you're up to."],
  ["Get placed in a group",
    "Groups are set by what we hear, so you're with people working at the same level."],
  ["Get your login",
    `Once groups are set we email you your account for the app. Classes begin on ${fmtDay(TERMS[0].startsOn)}.`],
];

export function confirmationText(c: Confirmation): string {
  const group = sideLabel(c.section).toLowerCase();
  return [
    `Assalamu alaikum ${c.firstName},`,
    ``,
    `Jazakum Allahu khayran for applying to BSMS Tajweed. Your application is in.`,
    ``,
    c.whatsappLink
      ? `Please join the ${group}' WhatsApp group now. It's where we'll share the times for the recitation sessions:\n${c.whatsappLink}`
      : `We'll message you on WhatsApp at ${c.phone} with the times for the recitation sessions.`,
    ``,
    `What happens next`,
    ...nextSteps().map(([t, b], i) => `${i + 1}. ${t}: ${b}`),
    ``,
    feeLine(c) + (c.paymentLink && !c.paidConfirmed ? `\n${c.paymentLink}` : ""),
    ``,
    `If anything in your application needs changing, just reply to this email.`,
    ``,
    `BSMS Tajweed`,
  ].join("\n");
}

export function confirmationHtml(c: Confirmation): string {
  const name = esc(c.firstName);
  const group = `${sideLabel(c.section).toLowerCase()}'`;

  const whatsapp = c.whatsappLink
    ? para(`The first thing to do is join the ${group} WhatsApp group. That's where we share the times for the recitation sessions and anything else you need before term.`)
      + button(c.whatsappLink, `Join the ${group} WhatsApp group`, "sage")
    : para(`We'll message you on WhatsApp at <strong>${esc(c.phone)}</strong> with the times for the recitation sessions.`);

  const fee = para(esc(feeLine(c)), 15)
    + (c.paymentLink && !c.paidConfirmed ? button(c.paymentLink, `Pay the ${esc(c.feeLabel)} fee`) : "");

  const body = [
    row(para(`Assalamu alaikum ${name},`, 17)),
    row(para("Jaz&#257;kum All&#257;hu khayran for applying. Your application is in, and we're looking forward to hearing you read.")),
    row(panel("Your application", "Received", `${sideLabel(c.section)} &middot; ${esc(c.feeLabel)} for the year`)),
    row(whatsapp),
    row(heading("What happens next") + steps(nextSteps())),
    row(`<div style="border-top:1px solid ${C.border};padding-top:20px;">${fee}</div>`),
    row(para("If anything in your application needs changing, just reply to this email.", 14)),
  ].join("\n");

  return shell({
    title: confirmationSubject(),
    preheader: c.whatsappLink
      ? `Next: join the ${group} WhatsApp group, then read for us.`
      : "Next: a short online session where you read for us.",
    body,
    footer: "BSMS Tajweed &middot; sent because you applied at bsmstajweed.com/apply.<br>Didn't apply? Reply and tell us.",
  });
}

/* ── 2. You're in: your login ─────────────────────────────────────────── */

export type Login = {
  firstName: string;
  email: string;
  section: Side;
  className: string;
  /** The one-time link that signs them in and lands on /welcome. */
  link: string;
};

export const loginSubject = () => "You're in: your BSMS Tajweed login";

export function loginText(l: Login): string {
  return [
    `Assalamu alaikum ${l.firstName},`,
    ``,
    `Alhamdulillah, you've been placed in ${l.className} (${sideLabel(l.section)}).`,
    `Classes begin on ${fmtDay(TERMS[0].startsOn)} at ${VENUE}.`,
    ``,
    `Your account on the BSMS Tajweed app is ready. It's where your lessons,`,
    `homework and hifdh tracking live. Set your password here:`,
    l.link,
    ``,
    `After that, sign in any time at ${SITE}/login`,
    `with this email address (${l.email}) and the password you chose.`,
    ``,
    `The link works once and runs out after ${LINK_VALID_HOURS} hours. If it has`,
    `expired, go to ${SITE}/forgot-password and enter this address for a fresh one.`,
    ``,
    `BSMS Tajweed`,
  ].join("\n");
}

export function loginHtml(l: Login): string {
  const body = [
    row(para(`Assalamu alaikum ${esc(l.firstName)},`, 17)),
    row(para("Al&#7717;amdulill&#257;h, you've been placed. Your account on the app is ready: it's where your lessons, homework and hifdh tracking live.")),
    row(panel("Your class", esc(l.className),
      `${sideLabel(l.section)} &middot; begins ${fmtDay(TERMS[0].startsOn)} at ${esc(VENUE)}`)),
    `<tr><td align="center" style="padding:0 34px;">${button(l.link, "Set up your account")}</td></tr>`,
    row(`<p style="margin:0 0 22px 0;font-size:14px;line-height:1.6;color:${C.muted};text-align:center;">You'll choose your own password. It takes a minute.</p>`),
    row(heading("Your login")
      + para(`<strong>Email:</strong> ${esc(l.email)}<br><strong>Password:</strong> the one you choose from the button above`, 15)
      + para(`After today, sign in at <a href="${SITE}/login" style="color:${C.ink};">bsmstajweed.com/login</a>.`, 15)),
    row(`<div style="border-top:1px solid ${C.border};padding-top:18px;">
      <p style="margin:0 0 12px 0;font-size:13px;line-height:1.6;color:${C.muted};">
        <strong style="color:${C.ink};">The button works once and runs out after ${LINK_VALID_HOURS} hours.</strong>
        If it has expired, go to <a href="${SITE}/forgot-password" style="color:${C.ink};">bsmstajweed.com/forgot-password</a>
        and enter this address for a fresh one.
      </p>
      <p style="margin:0;font-size:12px;line-height:1.6;color:${C.muted};">
        Button not working? Copy this in:<br>
        <span style="word-break:break-all;color:${C.ink};">${esc(l.link)}</span>
      </p></div>`),
  ].join("\n");

  return shell({
    title: loginSubject(),
    preheader: `You're in ${esc(l.className)}. Set your password to get into the app.`,
    body,
    footer: "BSMS Tajweed &middot; sent because you were placed on the course.<br>Not expecting this? Reply and tell us, and don't use the link.",
  });
}
