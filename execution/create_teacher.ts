/**
 * create_teacher.ts — add (or repair) one teacher account.
 *
 * The demo cohort in seed_demo.ts is deliberately built on the reserved
 * `.test` TLD, which can never receive mail. That is fine for a walkthrough
 * and useless the moment you want to exercise anything that sends email —
 * password reset above all. This script makes a single account with a real,
 * deliverable address.
 *
 * Run:  cd web && npx tsx ../execution/create_teacher.ts \
 *         --email you@example.com --name "Full Name" --section brothers
 *
 * Optional: --password "..."  (otherwise one is generated and printed once)
 *           --class "Masjid Al-Haram"  (put them in charge of that class)
 *
 * `--class` writes `classes.teacher_id`, NOT `profiles.class_id`. The two are
 * different edges and it is easy to reach for the wrong one: `profiles.class_id`
 * is the class a STUDENT sits in, while a teacher is joined to the class they
 * teach from the classes row. Setting the profile side for a teacher looks
 * like it worked and leaves the class with whoever taught it before.
 *
 * Idempotent: matched by email. Re-running resets the password and re-asserts
 * the profile rather than erroring on the duplicate.
 *
 * Note on email delivery: Supabase's built-in SMTP only delivers to addresses
 * on your own Supabase team, and only a couple of messages an hour. Your own
 * address works for testing; anyone else's needs custom SMTP configured first.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

/**
 * The dependencies live in web/node_modules, and nothing is installed at the
 * repo root. Node resolves bare specifiers by walking up from the *importing
 * file*, not from the working directory, so a plain
 * `import ... from "@supabase/supabase-js"` in this folder cannot be found no
 * matter which directory you run it from — `cd web` does not help.
 *
 * Resolving from web/package.json is what actually points Node at the right
 * tree. (seed_demo.ts carries the same bare import and the same documented
 * `cd web && npx tsx ...` invocation, so it has this bug latent in it too.)
 */
const requireFromWeb = createRequire(join(repoRoot, "web/package.json"));
const { createClient } = requireFromWeb("@supabase/supabase-js");

const env: Record<string, string> = {};
for (const line of readFileSync(join(repoRoot, "web/.env.local"), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

/** --key value pairs; anything else is a usage error rather than a guess. */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const email = arg("email");
const name = arg("name");
const section = arg("section") ?? "brothers";
const className = arg("class");
// 18 base64url chars — long enough not to be the weak link, short enough to
// be read off a screen and typed once before it gets changed.
const password = arg("password") ?? randomBytes(14).toString("base64url");

if (!email || !name) {
  console.error(
    'usage: npx tsx ../execution/create_teacher.ts --email <addr> --name "<full name>" ' +
      "[--section brothers|sisters] [--class <name>] [--password <pw>]",
  );
  process.exit(1);
}

if (section !== "brothers" && section !== "sisters") {
  console.error(`--section must be "brothers" or "sisters", got "${section}"`);
  process.exit(1);
}

if (/\.(test|example|invalid|localhost)$/i.test(email.split("@")[1] ?? "")) {
  console.error(
    `${email} is on a reserved TLD and can never receive mail — that is the ` +
      "exact problem this script exists to avoid. Use a real address.",
  );
  process.exit(1);
}

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/** Wrapped rather than run at the top level: tsx compiles this to CJS, where
 *  top-level await is a hard error. */
async function main() {
  // email_confirm so the account is usable immediately: without it the first
  // sign-in is blocked pending a confirmation mail, which is a second email
  // dependency in the middle of setting up the first one.
  const { data: created, error } = await db.auth.admin.createUser({
    email: email!,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });

  let userId = created?.user?.id;
  let existed = false;

  if (error) {
    const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const found = list?.users.find((u) => u.email === email);
    if (!found) throw new Error(`could not create or find ${email}: ${error.message}`);
    userId = found.id;
    existed = true;
    const { error: updateError } = await db.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (updateError) throw updateError;
  }

  const { error: profileError } = await db.from("profiles").upsert({
    id: userId!,
    full_name: name!,
    role: "teacher",
    section: section as "brothers" | "sisters",
    is_active: true,
  });
  if (profileError) throw profileError;

  console.log(`${existed ? "updated" : "created"} teacher ${name} <${email}>`);
  console.log(`  user id:  ${userId}`);
  console.log(`  password: ${password}`);

  if (className) {
    const { data: cls } = await db
      .from("classes")
      .select("id, name, teacher_id")
      .eq("name", className)
      .maybeSingle();
    if (!cls) throw new Error(`no class named "${className}"`);

    // A class holds exactly one teacher, so taking it over displaces whoever
    // held it. Printed rather than swallowed — that previous id is the whole
    // of what you need to put it back.
    if (cls.teacher_id && cls.teacher_id !== userId) {
      console.log(`  note: ${cls.name} was taught by ${cls.teacher_id} — reassigning`);
    }

    const { error: classError } = await db
      .from("classes")
      .update({ teacher_id: userId! })
      .eq("id", cls.id);
    if (classError) throw classError;
    console.log(`  class:    ${cls.name}`);
  }

  console.log("\nPassword shown once. Sign in, then change it at /account.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
