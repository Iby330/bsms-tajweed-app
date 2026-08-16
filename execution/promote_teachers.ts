/**
 * promote_teachers.ts — retire the demo teacher logins and hand the classes
 * to the real staff.
 *
 * Run:  cd web && npx tsx ../execution/promote_teachers.ts [--commit]
 * Without --commit it prints the plan and changes nothing.
 *
 * TWO JOBS, and the first is the urgent one:
 *
 *  1. ROTATE EVERY DEMO TEACHER PASSWORD. seed_demo.ts hard-codes
 *     "BsmsDemo2026!" and that file is in a public repo, while RLS grants any
 *     teacher read AND write over every student record, the deposit ledger
 *     included. That is survivable while the data is invented. It stops being
 *     survivable the moment a real student's name is in the table, so the
 *     rotation happens before any real data lands, not after.
 *
 *  2. Point each class at its real teacher. The demo accounts were named after
 *     the real staff, so the mapping is by first name and confirmed by which
 *     class each already holds.
 *
 * Classes whose teacher has not given an address yet are left assigned to the
 * demo profile — but with a rotated password, so the account is inert until
 * someone deliberately reactivates it.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
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

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const COMMIT = process.argv.includes("--commit");

/**
 * Who takes over which demo login, and which class moves to an existing
 * account. Read from a local file rather than written here: these are staff
 * members' personal addresses and this repo is public.
 *
 * `execution/handover.local.json` (gitignored) looks like:
 *
 *   {
 *     "handover": { "moadh@bsms-demo.test": "real@example.com" },
 *     "reassign": [{ "className": "Masjid Al-Haram", "toEmail": "real@example.com" }]
 *   }
 */
type HandoverFile = {
  handover: Record<string, string>;
  reassign: { className: string; toEmail: string }[];
};

const CONFIG_PATH = join(here, "handover.local.json");

function loadHandover(): HandoverFile {
  let raw: string;
  try {
    raw = readFileSync(CONFIG_PATH, "utf8");
  } catch {
    console.error(
      `Missing ${CONFIG_PATH}.\n` +
        `It holds the demo-login → real-address mapping and is deliberately not\n` +
        `committed. See the comment above loadHandover() for the shape.`,
    );
    process.exit(1);
  }
  const parsed = JSON.parse(raw) as Partial<HandoverFile>;
  return { handover: parsed.handover ?? {}, reassign: parsed.reassign ?? [] };
}

const { handover: HANDOVER, reassign: REASSIGN } = loadHandover();

async function main() {
  const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const byEmail = new Map<string, { id: string; email: string }>(
    list.users.map((u: { id: string; email: string }) => [u.email.toLowerCase(), u]),
  );

  const demoUsers = list.users.filter((u: { email: string }) =>
    u.email.endsWith("@bsms-demo.test"),
  );

  console.log(COMMIT ? "COMMITTING\n" : "DRY RUN — pass --commit to apply\n");

  // ---- 1. rotate every demo password ----------------------------------
  console.log(`Rotating ${demoUsers.length} demo passwords (kills the public-repo one):`);
  for (const u of demoUsers as { id: string; email: string }[]) {
    console.log(`  ${u.email}`);
    if (COMMIT) {
      const { error } = await db.auth.admin.updateUserById(u.id, {
        password: randomBytes(18).toString("base64url"),
      });
      if (error) throw error;
    }
  }

  // ---- 2. hand the demo accounts to real addresses ---------------------
  console.log(`\nHanding over ${Object.keys(HANDOVER).length} accounts:`);
  for (const [demoEmail, realEmail] of Object.entries(HANDOVER)) {
    const u = byEmail.get(demoEmail);
    if (!u) {
      console.log(`  ! ${demoEmail} not found — skipped`);
      continue;
    }
    if (byEmail.has(realEmail.toLowerCase())) {
      console.log(`  ! ${realEmail} already exists — skipped, needs manual merge`);
      continue;
    }
    console.log(`  ${demoEmail}  →  ${realEmail}`);
    if (COMMIT) {
      // email_confirm so they are not asked to confirm an address they never
      // signed up with; the invite mail is what proves they control it.
      const { error } = await db.auth.admin.updateUserById(u.id, {
        email: realEmail,
        email_confirm: true,
      });
      if (error) throw error;
    }
  }

  // ---- 3. move classes to accounts that already exist -------------------
  console.log(`\nReassigning classes:`);
  for (const { className, toEmail } of REASSIGN) {
    const u = byEmail.get(toEmail.toLowerCase());
    const { data: cls } = await db
      .from("classes").select("id, name, teacher_id").eq("name", className).maybeSingle();
    if (!u || !cls) {
      console.log(`  ! ${className} → ${toEmail}: not found — skipped`);
      continue;
    }
    console.log(`  ${className}  →  ${toEmail}`);
    if (COMMIT) {
      const { error } = await db.from("classes").update({ teacher_id: u.id }).eq("id", cls.id);
      if (error) throw error;

      // The class is linked from BOTH sides and moving only one leaves the app
      // half-right: `classes.teacher_id` decides whose roster it is, but
      // `profiles.class_id` is what the teacher's own screens read — it is
      // where ClassBackdrop gets the name of the place behind the page. Set
      // only the first and the new teacher gets somebody else's students on a
      // blank background.
      const { error: joinError } = await db
        .from("profiles").update({ class_id: cls.id }).eq("id", u.id);
      if (joinError) throw joinError;

      // Release the outgoing teacher, so two profiles never claim membership
      // of one class.
      if (cls.teacher_id && cls.teacher_id !== u.id) {
        const { error: oldError } = await db
          .from("profiles").update({ class_id: null }).eq("id", cls.teacher_id);
        if (oldError) throw oldError;
      }
    }
  }

  // ---- report ----------------------------------------------------------
  const { data: after } = await db
    .from("classes")
    .select("name, section, profiles!classes_teacher_fk(full_name)")
    .order("section").order("name");
  console.log(`\nClasses after this run:`);
  for (const c of after ?? []) {
    const t = (c.profiles as { full_name: string } | null)?.full_name ?? "—";
    console.log(`  ${String(c.name).padEnd(18)} ${String(c.section).padEnd(9)} ${t}`);
  }
  if (!COMMIT) console.log("\nNothing was changed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
