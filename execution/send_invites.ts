/**
 * send_invites.ts — email the real teachers a link that sets up their account.
 *
 * Run:  cd web && RESEND_API_KEY=re_xxx npx tsx ../execution/send_invites.ts [--commit]
 *       ... --only wala            send to one person
 *       ... --to me@example.com    send every message to one inbox, for testing
 * Without --commit it prints the plan and sends nothing.
 *
 * WHY NOT `inviteUserByEmail`: these accounts already exist. promote_teachers.ts
 * handed the demo logins over by changing their email and confirming it, so
 * Supabase treats them as established users and the invite call refuses them.
 *
 * WHY NOT `resetPasswordForEmail`: that would send Supabase's own "Reset your
 * password" template, which is the wrong words for three people who have never
 * logged in, and its link target is fixed in the dashboard template rather than
 * here. So the token is minted with generateLink (which sends nothing) and the
 * mail goes out through Resend with our own design and our own `next=/welcome`.
 *
 * The password is NOT set here and is not knowable: promote_teachers.ts rotated
 * every one to a random value it threw away. The link is the only way in, and
 * it lands them on /welcome to choose their own.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { inviteHtml, inviteText, inviteSubject, type Invite } from "./email/invite_email";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const requireFromWeb = createRequire(join(repoRoot, "web/package.json"));
const { createClient } = requireFromWeb("@supabase/supabase-js");

const env: Record<string, string> = {};
for (const line of readFileSync(join(repoRoot, "web/.env.local"), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const SITE = "https://bsms-tajweed.netlify.app";
const FROM = "BSMS Tajweed <noreply@bsmstajweed.com>";
const REPLY_TO = "info@bsmstajweed.com";

const COMMIT = process.argv.includes("--commit");
const argOf = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const ONLY = argOf("only")?.toLowerCase();
const OVERRIDE_TO = argOf("to");

/** Who gets one. Addresses live in the same gitignored file as the handover. */
type Recipient = { email: string; firstName: string };

function recipients(): Recipient[] {
  const raw = JSON.parse(readFileSync(join(here, "handover.local.json"), "utf8")) as {
    handover: Record<string, string>;
  };
  // The real address is the value; the first name comes from the profile below.
  return Object.values(raw.handover).map((email) => ({ email, firstName: "" }));
}

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function sendViaResend(to: string, subject: string, html: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY not set in the environment");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, html, text, reply_to: REPLY_TO }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Resend ${res.status}: ${body}`);
  return JSON.parse(body) as { id: string };
}

async function main() {
  console.log(COMMIT ? "SENDING\n" : "DRY RUN — pass --commit to actually send\n");

  const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const users = new Map<string, { id: string; email: string }>(
    list.users.map((u: { id: string; email: string }) => [u.email.toLowerCase(), u]),
  );

  let sent = 0;
  for (const r of recipients()) {
    if (ONLY && !r.email.toLowerCase().includes(ONLY)) continue;

    const user = users.get(r.email.toLowerCase());
    if (!user) {
      console.log(`  ! ${r.email} — no account, skipped`);
      continue;
    }

    // Name, class and roster size, so the mail is about them specifically.
    const { data: profile } = await db
      .from("profiles").select("full_name, section").eq("id", user.id).single();
    const { data: cls } = await db
      .from("classes").select("id, name").eq("teacher_id", user.id).maybeSingle();
    if (!profile || !cls) {
      console.log(`  ! ${r.email} — no profile or class, skipped`);
      continue;
    }
    const { count } = await db
      .from("profiles").select("id", { count: "exact", head: true })
      .eq("class_id", cls.id).eq("role", "student").eq("is_active", true);

    // generateLink mints the token WITHOUT emailing it — the whole point, since
    // the message itself is ours to shape.
    const { data: linkData, error: linkError } = await db.auth.admin.generateLink({
      type: "recovery",
      email: r.email,
    });
    if (linkError) {
      console.log(`  ! ${r.email} — generateLink failed: ${linkError.message}`);
      continue;
    }
    const hash = linkData.properties.hashed_token;
    const link =
      `${SITE}/auth/confirm?token_hash=${hash}&type=recovery&next=${encodeURIComponent("/welcome")}`;

    const invite: Invite = {
      firstName: profile.full_name.split(/\s+/)[0],
      className: cls.name,
      studentCount: count ?? 0,
      section: profile.section as "brothers" | "sisters",
      link,
    };

    const target = OVERRIDE_TO ?? r.email;
    console.log(
      `  ${invite.firstName.padEnd(9)} ${cls.name.padEnd(18)} ${String(invite.studentCount).padStart(2)} students  →  ${target}`,
    );

    if (COMMIT) {
      const { id } = await sendViaResend(
        target, inviteSubject(), inviteHtml(invite), inviteText(invite),
      );
      // Mark them as needing setup only once the mail is actually away. Set it
      // before the send and a Resend failure would lock a teacher who never
      // got an invitation behind a form they cannot escape.
      const { error: flagErr } = await db
        .from("profiles").update({ setup_complete: false }).eq("id", user.id);
      if (flagErr) throw flagErr;
      console.log(`      sent, resend id ${id}`);
      sent++;
    }
  }

  console.log(COMMIT ? `\nDone — ${sent} sent.` : "\nNothing sent (dry run).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
