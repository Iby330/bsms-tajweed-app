import "server-only";

/**
 * Send one email through Resend.
 *
 * The same sender, reply-to and verified domain as the teacher invitations
 * (execution/send_invites.ts), so every message from the programme arrives
 * from one address with one reputation. bsmstajweed.com carries DKIM
 * (resend._domainkey), SPF on the send. subdomain and a DMARC record, which is
 * what keeps these out of spam, far more than anything in the body.
 *
 * Returns a result rather than throwing: both callers have something more
 * important going on (an application being saved, a batch of logins being
 * sent) that one failed email must not take down with it.
 *
 * RESEND_API_KEY must be set on the Netlify site as well as in .env.local.
 * Nothing syncs them, and a key that exists only locally builds and runs
 * fine here, then fails every send in production.
 */

const FROM = "BSMS Tajweed <noreply@bsmstajweed.com>";
const REPLY_TO = "info@bsmstajweed.com";

export type Email = { to: string; subject: string; html: string; text: string };
export type SendResult = { ok: true; id: string } | { ok: false; error: string };

export async function sendEmail(mail: Email): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY is not set." };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, reply_to: REPLY_TO, ...mail }),
    });
    const body = await res.text();
    if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${body}` };
    return { ok: true, id: (JSON.parse(body) as { id: string }).id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
