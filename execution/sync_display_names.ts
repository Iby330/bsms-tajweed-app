/**
 * sync_display_names.ts — make the Supabase dashboard call people by their real name.
 *
 * Run:  cd web && npx tsx ../execution/sync_display_names.ts [--commit]
 * Without --commit it prints the drift and changes nothing.
 *
 * There are two names per person, and only one of them is the app's:
 *
 *   · `profiles.full_name`  — the single source of truth. Every screen, every
 *     register, every audit trail reads this and nothing else.
 *   · `auth.users.raw_user_meta_data.full_name` — what the Supabase dashboard
 *     shows in its Display name column, and what an email template would use.
 *
 * Accounts here were seeded with placeholder surnames and then handed over, so
 * the two drift the moment somebody renames themselves. The app now writes both
 * (see completeSetup and setOwnName), which keeps them together from here on;
 * this script is for the accounts that drifted before that, and for the rename
 * paths that have no session to write metadata through — promote_teachers.ts
 * sets `profiles.full_name` directly, and a rename typed into the dashboard's
 * table editor does too.
 *
 * The metadata goes through the Auth admin API rather than `update auth.users`.
 * Supabase blocks DDL on the auth schema and treats the tables as its own; the
 * API is the supported way in, and it keeps GoTrue's own caches honest.
 *
 * Safe to run any time: it only writes where the two disagree, and it treats
 * `profiles` as authoritative in every case — it never copies a name back the
 * other way.
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

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const COMMIT = process.argv.includes("--commit");

type AuthUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown> | null;
};

/** listUsers is paginated, and 71 accounts today is one page of a thousand
 *  tomorrow — walk it rather than trusting the first page to be everything. */
async function allAuthUsers(): Promise<AuthUser[]> {
  const users: AuthUser[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers page ${page}: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < 200) return users;
  }
}

async function main() {
  const { data: profiles, error } = await db
    .from("profiles")
    .select("id, full_name, role")
    .order("role")
    .order("full_name");
  if (error) throw new Error(error.message);

  const authById = new Map((await allAuthUsers()).map((u) => [u.id, u]));

  const drift = (profiles ?? []).flatMap((p) => {
    const user = authById.get(p.id);
    // A profile with no auth user cannot sign in and has no display name to
    // fix; that is a different problem and not this script's to report on.
    if (!user) return [];
    const shown = (user.user_metadata?.full_name as string | undefined) ?? "";
    if (shown === p.full_name) return [];
    return [{ id: p.id, role: p.role, email: user.email ?? "(no email)", was: shown, now: p.full_name }];
  });

  console.log(
    `${profiles?.length ?? 0} profiles · ${authById.size} auth users · ${drift.length} out of step`,
  );
  if (drift.length === 0) {
    console.log("Nothing to do — every display name already matches its profile.");
    return;
  }

  for (const d of drift) {
    console.log(`  ${d.role.padEnd(7)} ${d.email.padEnd(30)} ${d.was || "(blank)"} → ${d.now}`);
  }

  if (!COMMIT) {
    console.log("\nDry run. Re-run with --commit to write these.");
    return;
  }

  let done = 0;
  for (const d of drift) {
    // Metadata is a whole-object replace on the API, so anything else living in
    // it (email_verified, for one) has to be carried over by hand or it is lost.
    const existing = authById.get(d.id)?.user_metadata ?? {};
    const { error: writeError } = await db.auth.admin.updateUserById(d.id, {
      user_metadata: { ...existing, full_name: d.now },
    });
    if (writeError) {
      console.error(`  ! ${d.email}: ${writeError.message}`);
      continue;
    }
    done++;
  }
  console.log(`\nUpdated ${done} of ${drift.length}.`);
  if (done < drift.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
