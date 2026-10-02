/**
 * place_and_send_logins.ts — place applicants in classes and email their
 * logins, the same two steps as the applications board's class dropdown and
 * Send login, for a whole intake at once.
 *
 * Run:  cd web && npx tsx ../execution/place_and_send_logins.ts <plan.json> [--commit]
 *       ... --to me@example.com    send every email to one inbox, for testing
 * Without --commit it prints the plan and changes nothing.
 *
 * <plan.json> is a list of { applicationId, className, sendLogin? }. Keep it
 * OUT of the repo: it is people. sendLogin false places without emailing
 * (an address that needs checking first).
 *
 * KEEP IN STEP with placeInClass / sendLogin in web/src/lib/applications/
 * actions.ts. Those are server actions behind a teacher session and cannot be
 * called from here, so their writes are repeated below; the email itself is
 * NOT repeated — it is the app's own template (lib/email/applicant-emails.ts),
 * so a student cannot tell which path sent it.
 *
 * Safe to re-run: a placed applicant is placed again (no-op), an existing
 * account is reused, and anyone whose login_sent_at is set is skipped unless
 * --resend is given.
 */

import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const requireFromWeb = createRequire(join(repoRoot, "web/package.json"));
const { createClient } = requireFromWeb("@supabase/supabase-js");

const env: Record<string, string> = {};
for (const line of readFileSync(join(repoRoot, "web/.env.local"), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const COMMIT = process.argv.includes("--commit");
const RESEND = process.argv.includes("--resend");
const argOf = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const OVERRIDE_TO = argOf("to");
const PLAN_PATH = process.argv.slice(2).find((a) => a.endsWith(".json"));

type PlanRow = { applicationId: string; className: string; sendLogin?: boolean; listName?: string };

const FROM = "BSMS Tajweed <noreply@bsmstajweed.com>";
const REPLY_TO = "info@bsmstajweed.com";

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function resendKey(): Promise<string> {
  if (process.env.RESEND_API_KEY) return process.env.RESEND_API_KEY;
  const { data } = await db.rpc("resend_api_key");
  if (typeof data !== "string" || !data) throw new Error("No Resend key in env or Vault");
  return data;
}

async function send(key: string, mail: { to: string; subject: string; html: string; text: string }) {
  // Resend allows 2 requests a second; this runs one at a time and backs off on 429.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, reply_to: REPLY_TO, ...mail }),
    });
    if (res.ok) return;
    if (res.status === 429 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      continue;
    }
    throw new Error(`Resend ${res.status}: ${await res.text()}`);
  }
}

async function findUserByEmail(email: string): Promise<string | null> {
  const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const want = email.toLowerCase();
  return data?.users.find((u: { email?: string }) => u.email?.toLowerCase() === want)?.id ?? null;
}

async function main() {
  if (!PLAN_PATH) throw new Error("Pass the plan file: <plan.json>");
  const plan = JSON.parse(readFileSync(resolve(PLAN_PATH), "utf8")) as PlanRow[];
  const { SITE, loginHtml, loginSubject, loginText } = await import(
    "../web/src/lib/email/applicant-emails"
  );

  const { data: classes } = await db.from("classes").select("id, name, section");
  const classByName = new Map((classes ?? []).map((c: { name: string }) => [c.name, c]));
  // reviewed_by on the board is the teacher who placed them; here, the lead
  const { data: lead } = await db.from("profiles").select("id")
    .eq("role", "teacher").eq("full_name", "Ibrahim Ramadan").eq("is_active", true).maybeSingle();

  const key = COMMIT ? await resendKey() : "";
  const failures: string[] = [];
  let sent = 0;

  for (const row of plan) {
    const cls = classByName.get(row.className) as { id: string; name: string; section: string } | undefined;
    const { data: app } = await db.from("applications")
      .select("id, first_name, surname, email, section, status, class_id, profile_id, login_sent_at")
      .eq("id", row.applicationId).maybeSingle();
    const who = app ? `${app.first_name} ${app.surname}` : row.applicationId;
    if (!app || !cls) { failures.push(`${who}: application or class "${row.className}" not found`); continue; }
    if (cls.section !== app.section) { failures.push(`${who}: ${app.section} applicant, ${cls.section} class`); continue; }

    const willSend = row.sendLogin !== false && (RESEND || !app.login_sent_at);
    console.log(`${COMMIT ? "" : "[dry] "}${who.padEnd(28)} → ${cls.name.padEnd(17)} ${willSend ? "login" : row.sendLogin === false ? "HELD (no email)" : "login already sent"}`);
    if (!COMMIT) continue;

    // placeInClass: choosing a class IS the placement
    const { error: placeErr } = await db.from("applications").update({
      class_id: cls.id, status: "placed",
      reviewed_by: lead?.id ?? null, reviewed_at: new Date().toISOString(),
    }).eq("id", app.id);
    if (placeErr) { failures.push(`${who}: not placed: ${placeErr.message}`); continue; }
    if (app.profile_id) {
      await db.from("profiles").update({ class_id: cls.id, is_active: true }).eq("id", app.profile_id);
    }
    if (!willSend) continue;

    // sendLogin: the account, then the email
    const fullName = `${app.first_name} ${app.surname}`;
    let userId: string | null = app.profile_id;
    if (!userId) {
      const { data: created, error } = await db.auth.admin.createUser({
        email: app.email, password: randomBytes(24).toString("base64url"),
        email_confirm: true, user_metadata: { full_name: fullName },
      });
      userId = created?.user?.id ?? (await findUserByEmail(app.email));
      if (!userId) { failures.push(`${who}: no account: ${error?.message}`); continue; }
      if (!created?.user) {
        const { data: prof } = await db.from("profiles").select("role").eq("id", userId).maybeSingle();
        if (prof?.role === "teacher") { failures.push(`${who}: email belongs to a teacher`); continue; }
      }
      const { error: pErr } = await db.from("profiles").upsert({
        id: userId, full_name: fullName, role: "student", section: app.section,
        class_id: cls.id, is_active: true, setup_complete: false,
      });
      if (pErr) { failures.push(`${who}: account made, profile not: ${pErr.message}`); continue; }
      const { error: linkSaveErr } = await db.from("applications").update({ profile_id: userId }).eq("id", app.id);
      if (linkSaveErr) { failures.push(`${who}: account not linked: ${linkSaveErr.message}`); continue; }
    }

    const { data: linkData, error: linkErr } = await db.auth.admin.generateLink({ type: "recovery", email: app.email });
    if (linkErr || !linkData) { failures.push(`${who}: no link: ${linkErr?.message}`); continue; }
    const link = `${SITE}/auth/confirm?token_hash=${linkData.properties.hashed_token}`
      + `&type=recovery&next=${encodeURIComponent("/welcome")}`;
    const login = { firstName: app.first_name, email: app.email, section: app.section, className: cls.name, link };
    try {
      await send(key, { to: OVERRIDE_TO ?? app.email, subject: loginSubject(), html: loginHtml(login), text: loginText(login) });
    } catch (e) {
      failures.push(`${who}: email not sent: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    if (!OVERRIDE_TO) {
      await db.from("applications").update({ login_sent_at: new Date().toISOString() }).eq("id", app.id);
    }
    sent++;
    await new Promise((r) => setTimeout(r, 600)); // under Resend's 2/s
  }

  console.log(`\n${COMMIT ? `sent ${sent}` : "dry run — nothing changed"}; ${failures.length} problem(s)`);
  for (const f of failures) console.log(`  ! ${f}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
