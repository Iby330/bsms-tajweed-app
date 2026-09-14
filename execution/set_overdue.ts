/**
 * set_overdue.ts — leave a demo student with exactly N overdue homeworks.
 *
 * Run:  cd web && npx tsx ../execution/set_overdue.ts <email> [count]
 *       cd web && npx tsx ../execution/set_overdue.ts adam.w@bsms-demo.test 1
 *
 * WHY THIS EXISTS. Home counts a homework overdue when its due date has
 * passed and the student has not handed it in. A demo account that can see
 * the whole year (`profiles.unlock_all`) therefore inherits every paper the
 * year has ever set, and lands on a screen listing seven of them — which is
 * a true statement about fictional data and a terrible thing to demo.
 *
 * WHAT IT DOES. Hands in the oldest of them, keeping the N most recently due
 * as the ones still outstanding, because the believable story is "you are one
 * behind", not "you have done the seven oldest and skipped the newest".
 *
 * It is deliberately ADDITIVE: it only ever marks work as handed in, and
 * never withdraws a hand-in to manufacture an overdue. So it cannot destroy
 * marked work, and re-running it is a no-op. If the student already has N or
 * fewer overdue it changes nothing and says so.
 *
 * `submitted` rather than `approved`: approving without answers would show a
 * 0% mark on Home and drag the year average down. "Handed in, waiting on a
 * teacher" claims nothing that is not there.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const env: Record<string, string> = {};
for (const line of readFileSync(join(repoRoot, "web/.env.local"), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const HANDED_IN = new Set(["submitted", "auto_marked", "approved"]);

async function main() {
  const email = process.argv[2];
  const keep = Number(process.argv[3] ?? 1);
  if (!email || !Number.isInteger(keep) || keep < 0) {
    console.error("usage: npx tsx ../execution/set_overdue.ts <email> [count]");
    process.exit(1);
  }

  // Matched through auth.users by email: full_name is edited from the app,
  // the email is not.
  const { data: users, error: uErr } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (uErr) throw uErr;
  const user = users.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) throw new Error(`no auth user with email ${email}`);

  const { data: profile } = await db
    .from("profiles").select("id, full_name").eq("id", user.id).single();
  if (!profile) throw new Error(`no profile for ${email}`);

  const [{ data: homeworks }, { data: subs }] = await Promise.all([
    db.from("homeworks").select("id, number, series, title, due_at").order("due_at"),
    db.from("submissions").select("homework_id, status").eq("student_id", user.id),
  ]);
  const statusOf = new Map((subs ?? []).map((s) => [s.homework_id, s.status as string]));

  const now = Date.now();
  const overdue = (homeworks ?? [])
    .filter((h) => h.due_at && Date.parse(h.due_at) < now)
    .filter((h) => !HANDED_IN.has(statusOf.get(h.id) ?? ""))
    .sort((a, b) => Date.parse(a.due_at!) - Date.parse(b.due_at!));

  console.log(`${profile.full_name} <${email}> — ${overdue.length} overdue, keeping ${keep}`);
  if (overdue.length <= keep) {
    console.log("nothing to do.");
    return;
  }

  // Oldest first, so the ones left outstanding are the most recently due.
  const toHandIn = overdue.slice(0, overdue.length - keep);
  const rows = toHandIn.map((h) => ({
    homework_id: h.id,
    student_id: user.id,
    status: "submitted",
    is_late: true,
    // A day after it was due — late, which is exactly what it was.
    submitted_at: new Date(Date.parse(h.due_at!) + 86_400_000).toISOString(),
  }));
  const { error } = await db
    .from("submissions").upsert(rows, { onConflict: "homework_id,student_id" });
  if (error) throw error;

  for (const h of toHandIn) {
    console.log(`  handed in  hw ${h.number}  ${h.series}  (was due ${h.due_at!.slice(0, 10)})`);
  }
  for (const h of overdue.slice(overdue.length - keep)) {
    console.log(`  LEFT OVERDUE  hw ${h.number}  ${h.series}  due ${h.due_at!.slice(0, 10)}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
