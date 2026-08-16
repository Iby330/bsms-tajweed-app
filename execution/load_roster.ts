/**
 * load_roster.ts — put the real 2025/26 students into their classes.
 *
 * Run:  cd web && npx tsx ../execution/load_roster.ts <roster.json> [--commit]
 * Without --commit it prints the plan and changes nothing.
 *
 * The roster JSON is [{ full_name, class, section }] — reviewed by hand against
 * the master spreadsheet's per-class score sheets, which are the only tab that
 * states a student's class unambiguously. The homework tabs ask for it three
 * different ways and eight of them don't ask at all.
 *
 * The invented students seeded by seed_demo.ts are DEACTIVATED rather than
 * deleted. They carry submissions, attendance, marks and hifz records; deleting
 * the profile would cascade through all of it, and the teacher screens already
 * filter on is_active, so flipping the flag removes them from view without
 * destroying anything. It is also reversible, which deletion is not.
 *
 * Each student gets an auth user, because profiles.id references auth.users —
 * a profile cannot exist without one.
 *
 * Their address is a placeholder on the RFC-reserved .invalid TLD, NOT the real
 * one from the spreadsheet. This cohort is last year's, loaded so returning
 * teachers can look around; giving them live addresses would let any of them
 * use the password-reset link and walk into the app, which nobody asked for.
 * .invalid can never receive mail, so the accounts are inert by construction.
 * Real addresses go in with the new cohort in October.
 */

import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { randomUUID, randomBytes } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const requireFromWeb = createRequire(join(repoRoot, "web/package.json"));
const { createClient } = requireFromWeb("@supabase/supabase-js");

const env: Record<string, string> = {};
for (const line of readFileSync(join(repoRoot, "web/.env.local"), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const rosterPath = process.argv[2];
const COMMIT = process.argv.includes("--commit");
if (!rosterPath) {
  console.error("usage: npx tsx ../execution/load_roster.ts <roster.json> [--commit]");
  process.exit(1);
}

type Row = { full_name: string; class: string; section: "brothers" | "sisters" };
const roster: Row[] = JSON.parse(readFileSync(resolve(rosterPath), "utf8"));

async function main() {
  const { data: classes } = await db.from("classes").select("id, name, section");
  const byName = new Map((classes ?? []).map((c: { id: string; name: string }) => [c.name, c.id]));

  const missing = [...new Set(roster.map((r) => r.class))].filter((n) => !byName.has(n));
  if (missing.length) throw new Error(`no such class: ${missing.join(", ")}`);

  // Anyone already on the roster by name is left alone, so a re-run is safe.
  const { data: existing } = await db
    .from("profiles").select("id, full_name").eq("role", "student");
  const have = new Set((existing ?? []).map((p: { full_name: string }) => p.full_name));

  const toAdd = roster.filter((r) => !have.has(r.full_name));
  const demo = (existing ?? []).filter((p: { full_name: string }) =>
    !roster.some((r) => r.full_name === p.full_name),
  );

  console.log(COMMIT ? "COMMITTING\n" : "DRY RUN — pass --commit to apply\n");
  console.log(`Adding ${toAdd.length} students`);
  console.log(`Deactivating ${demo.length} seeded demo students (is_active = false)\n`);

  if (COMMIT) {
    for (const r of toAdd) {
      const slug = r.full_name.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "");
      const { data: created, error: authError } = await db.auth.admin.createUser({
        email: `${slug}@roster.invalid`,
        password: randomBytes(18).toString("base64url"),
        email_confirm: true,
        user_metadata: { full_name: r.full_name, placeholder: true },
      });
      if (authError) throw new Error(`${r.full_name}: ${authError.message}`);
      const { error } = await db.from("profiles").insert({
        id: created.user.id,
        full_name: r.full_name,
        role: "student" as const,
        section: r.section,
        class_id: byName.get(r.class)!,
        is_active: true,
      });
      if (error) throw error;
    }
  }

  if (COMMIT && demo.length) {
    const { error } = await db
      .from("profiles").update({ is_active: false })
      .in("id", demo.map((p: { id: string }) => p.id));
    if (error) throw error;
  }

  const { data: after } = await db
    .from("classes")
    .select("name, section, profiles!profiles_class_id_fkey(id, is_active, role)")
    .order("section").order("name");

  console.log("Active students per class:");
  for (const c of after ?? []) {
    const ps = (c.profiles as { is_active: boolean; role: string }[]) ?? [];
    const n = ps.filter((p) => p.role === "student" && p.is_active).length;
    console.log(`  ${String(c.name).padEnd(18)} ${String(c.section).padEnd(9)} ${n}`);
  }
  if (!COMMIT) console.log("\nNothing was changed.");
}

main().catch((e) => { console.error(e); process.exit(1); });
