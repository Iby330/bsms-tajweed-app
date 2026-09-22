/**
 * preview_emails.ts — send the applicant emails to one inbox, to see them for real.
 *
 * Run:  cd web && npx tsx ../execution/preview_emails.ts you@example.com [--commit]
 * Without --commit it only renders them and says what it would send.
 *
 * Sends both emails an applicant can get (the confirmation and the login)
 * with sample details, through the same templates and the same sender the app
 * uses. Nothing is written to the database and no account is made: the login
 * email's button points at a dummy token and will just say the link expired.
 *
 * The key comes from RESEND_API_KEY if set, otherwise from Supabase Vault via
 * the service role, exactly as the app finds it (migration 0036).
 *
 * Run from web/ so tsx picks up web/tsconfig.json and its "@/..." paths.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  confirmationHtml, confirmationSubject, confirmationText,
  loginHtml, loginSubject, loginText, SITE,
} from "../web/src/lib/email/applicant-emails";
import { PAYMENT_LINK, WHATSAPP_GROUPS, feeLabel } from "../web/src/lib/applications/form";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const requireFromWeb = createRequire(join(repoRoot, "web/package.json"));
const { createClient } = requireFromWeb("@supabase/supabase-js");

const env: Record<string, string> = {};
for (const line of readFileSync(join(repoRoot, "web/.env.local"), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const FROM = "BSMS Tajweed <noreply@bsmstajweed.com>";
const REPLY_TO = "info@bsmstajweed.com";
const COMMIT = process.argv.includes("--commit");
const to = process.argv.slice(2).find((a) => a.includes("@"));

async function key(): Promise<string> {
  const k = process.env.RESEND_API_KEY ?? env.RESEND_API_KEY;
  if (k) return k;
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await db.rpc("resend_api_key");
  if (error || !data) {
    throw new Error("No Resend key: not in the environment, and none in Vault named 'resend_api_key'.");
  }
  return data as string;
}

async function main() {
  if (!to) {
    console.error("usage: npx tsx ../execution/preview_emails.ts you@example.com [--commit]");
    process.exit(1);
  }

  const mails = [
    {
      subject: `[Preview] ${confirmationSubject()}`,
      ...(() => {
        const c = {
          firstName: "Yusuf", section: "brothers" as const,
          feeLabel: feeLabel(), paidConfirmed: false,
          // A stand-in until the real link is set, so the preview shows the
          // button every real applicant will get.
          whatsappLink: WHATSAPP_GROUPS.brothers ?? "https://chat.whatsapp.com/PREVIEW",
          paymentLink: PAYMENT_LINK,
        };
        return { html: confirmationHtml(c), text: confirmationText(c) };
      })(),
    },
    {
      subject: `[Preview] ${loginSubject()}`,
      ...(() => {
        const l = {
          firstName: "Yusuf", email: to, section: "brothers" as const,
          className: "Brothers Group 2",
          link: `${SITE}/auth/confirm?token_hash=preview&type=recovery&next=%2Fwelcome`,
        };
        return { html: loginHtml(l), text: loginText(l) };
      })(),
    },
  ];

  console.log(COMMIT ? "SENDING\n" : "DRY RUN — pass --commit to actually send\n");
  const k = COMMIT ? await key() : "";

  for (const m of mails) {
    console.log(`  ${m.subject}  →  ${to}`);
    if (!COMMIT) continue;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, reply_to: REPLY_TO, to, ...m }),
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`Resend ${res.status}: ${body}`);
    console.log(`      sent, resend id ${(JSON.parse(body) as { id: string }).id}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
