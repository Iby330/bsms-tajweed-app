/**
 * send_student_login.ts — email a login link to a student added directly to a
 * class with create_student.ts.
 *
 * Run:  cd web && npx tsx ../execution/send_student_login.ts --email a@b.com [--commit]
 *       ... --to me@example.com    send the message to another inbox, for testing
 * Without --commit it prints the plan and the text and sends nothing.
 *
 * WHY NOT the applicants' login email (lib/email/applicant-emails.ts): it says
 * "you've been placed" and gives the programme's start date and venue, none of
 * which is true of a class outside the programme. This one borrows that email's
 * look and leaves those claims out.
 *
 * The token comes from generateLink, which sends nothing, and the mail goes out
 * through Resend. Each run mints a new link, so the last email sent is the one
 * that works.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

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
/** Mirrors "Email OTP Expiration" in the Supabase dashboard, as the other invites do. */
const LINK_VALID_HOURS = 24;

const COMMIT = process.argv.includes("--commit");
const argOf = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  const email = argOf("email")?.toLowerCase();
  if (!email) throw new Error("need --email");
  const { SITE, C, esc, para, row, button, panel, heading, shell } = await import(
    "../web/src/lib/email/applicant-emails"
  );

  const { data: list, error: listError } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;
  const user = list.users.find((u: { email?: string }) => u.email?.toLowerCase() === email);
  if (!user) throw new Error(`no account for ${email}`);

  const { data: profile, error: profileError } = await db
    .from("profiles").select("full_name, role, class_id").eq("id", user.id).single();
  if (profileError) throw profileError;
  if (profile.role !== "student" || !profile.class_id) throw new Error(`${email} is not a student in a class`);

  const { data: cls, error: classError } = await db
    .from("classes").select("name, teacher_id").eq("id", profile.class_id).single();
  if (classError) throw classError;
  const { data: teacher } = cls.teacher_id
    ? await db.from("profiles").select("full_name").eq("id", cls.teacher_id).maybeSingle()
    : { data: null };

  const firstName = profile.full_name.split(/\s+/)[0];
  const subject = "Your BSMS Tajweed login";
  const taughtBy = teacher ? `Taught by ${teacher.full_name}` : "On the BSMS Tajweed app";

  console.log(`${COMMIT ? "SENDING" : "DRY RUN, pass --commit to send"}: ${firstName}, ${cls.name}, ${taughtBy}`);
  console.log(`to ${argOf("to") ?? email}\n`);

  const { data: linkData, error: linkError } = COMMIT
    ? await db.auth.admin.generateLink({ type: "recovery", email })
    : { data: { properties: { hashed_token: "DRY-RUN" } }, error: null };
  if (linkError) throw linkError;
  const link = `${SITE}/auth/confirm?token_hash=${linkData.properties.hashed_token}`
    + `&type=recovery&next=${encodeURIComponent("/welcome")}`;

  const text = [
    `Assalamu alaikum ${firstName},`,
    ``,
    `You've been added to ${cls.name} on the BSMS Tajweed app. ${taughtBy}.`,
    ``,
    `Set your password here:`,
    link,
    ``,
    `After that, sign in any time at ${SITE}/login`,
    `with this email address (${email}) and the password you chose.`,
    ``,
    `The link works once and runs out after ${LINK_VALID_HOURS} hours. If it has`,
    `expired, go to ${SITE}/forgot-password and enter this address for a fresh one.`,
    ``,
    `BSMS Tajweed`,
  ].join("\n");

  const html = shell({
    title: subject,
    preheader: `You've been added to ${esc(cls.name)}. Set your password to get into the app.`,
    body: [
      row(para(`Assalamu alaikum ${esc(firstName)},`, 17)),
      row(para("You've been added to a class on the BSMS Tajweed app, and your account is ready.")),
      row(panel("Your class", esc(cls.name), esc(taughtBy))),
      `<tr><td align="center" style="padding:0 34px;">${button(link, "Set up your account")}</td></tr>`,
      row(`<p style="margin:0 0 22px 0;font-size:14px;line-height:1.6;color:${C.muted};text-align:center;">You'll choose your own password. It takes a minute.</p>`),
      row(heading("Your login")
        + para(`<strong>Email:</strong> ${esc(email)}<br><strong>Password:</strong> the one you choose from the button above`, 15)
        + para(`After today, sign in at <a href="${SITE}/login" style="color:${C.ink};">bsmstajweed.com/login</a>.`, 15)),
      row(`<div style="border-top:1px solid ${C.border};padding-top:18px;">
        <p style="margin:0 0 12px 0;font-size:13px;line-height:1.6;color:${C.muted};">
          <strong style="color:${C.ink};">The button works once and runs out after ${LINK_VALID_HOURS} hours.</strong>
          If it has expired, go to <a href="${SITE}/forgot-password" style="color:${C.ink};">bsmstajweed.com/forgot-password</a>
          and enter this address for a fresh one.
        </p>
        <p style="margin:0;font-size:12px;line-height:1.6;color:${C.muted};">
          Button not working? Copy this in:<br>
          <span style="word-break:break-all;color:${C.ink};">${esc(link)}</span>
        </p></div>`),
    ].join("\n"),
    footer: "BSMS Tajweed &middot; sent because you were added to this class.<br>Not expecting this? Reply and tell us, and don't use the link.",
  });

  if (!COMMIT) {
    console.log(text);
    console.log(`\nNothing sent. HTML is ${html.length} characters.`);
    return;
  }

  const { data: key } = await db.rpc("resend_api_key");
  const apiKey = process.env.RESEND_API_KEY ?? (typeof key === "string" ? key : "");
  if (!apiKey) throw new Error("No Resend key: set RESEND_API_KEY or add it to Vault");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, reply_to: REPLY_TO, to: argOf("to") ?? email, subject, html, text }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Resend ${res.status}: ${body}`);
  console.log(`sent, resend id ${JSON.parse(body).id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
