import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

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
 * THE KEY: RESEND_API_KEY from the environment if it is set, otherwise the
 * one in Supabase Vault (migration 0036). Vault exists because the Netlify
 * site's env vars can only be edited from one person's account, and the repo
 * is public, so the key can go in neither the code nor, easily, Netlify.
 */

const FROM = "BSMS Tajweed <noreply@bsmstajweed.com>";
const REPLY_TO = "info@bsmstajweed.com";

export type Email = { to: string; subject: string; html: string; text: string };
export type SendResult = { ok: true; id: string } | { ok: false; error: string };

/** Looked up once per server instance: a batch of logins sends one email
 *  per request, and there is no need to ask Vault every time. A missing key
 *  is not cached, so adding it takes effect without a redeploy. */
let cachedKey: string | null = null;

async function resendKey(): Promise<string | null> {
  if (process.env.RESEND_API_KEY) return process.env.RESEND_API_KEY;
  if (cachedKey) return cachedKey;
  const { data } = await supabaseAdmin().rpc("resend_api_key");
  cachedKey = typeof data === "string" && data ? data : null;
  return cachedKey;
}

export async function sendEmail(mail: Email): Promise<SendResult> {
  const key = await resendKey();
  if (!key) return { ok: false, error: "No Resend key: set RESEND_API_KEY or add it to Vault." };

  // Resend allows 2 requests a second. One applicant submitting is nowhere
  // near that, but several submitting in the same second (a link going out to
  // a group chat, which is exactly how this form is shared) would have one of
  // them refused with a 429. Waiting and trying again costs that one person a
  // second and saves the confirmation email they would otherwise never get.
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM, reply_to: REPLY_TO, ...mail }),
      });
      const body = await res.text();
      if (res.ok) return { ok: true, id: (JSON.parse(body) as { id: string }).id };
      if (res.status === 429 && attempt < 3) {
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
        continue;
      }
      return { ok: false, error: `Resend ${res.status}: ${body}` };
    } catch (e) {
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
