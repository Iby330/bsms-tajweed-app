/**
 * create_student.ts — add one student directly to a class, outside the
 * applications flow (which only knows the brothers' and sisters' classes).
 *
 * Run:  npx --prefix web tsx execution/create_student.ts \
 *         --email a@b.com --name "First" --class "Esteemed Ustadhs"
 *
 * Sends nothing. The account has a random password nobody knows and
 * setup_complete false, so the person's first way in is a link or "Forgot
 * password", which lands them on /welcome to choose their name and password.
 *
 * In the ustadhs' class a hifz profile is added too, because classmates can only
 * log a recitation for someone who has one.
 *
 * Idempotent: matched by email. Re-running re-asserts the class and leaves an
 * existing password and name alone.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";

const repoRoot = join(__dirname, "..");
const requireFromWeb = createRequire(join(repoRoot, "web/package.json"));
const { createClient } = requireFromWeb("@supabase/supabase-js");

const env: Record<string, string> = {};
for (const line of readFileSync(join(repoRoot, "web/.env.local"), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const email = arg("email")?.toLowerCase();
  const name = arg("name");
  const className = arg("class");
  if (!email || !name || !className) throw new Error('need --email, --name and --class');

  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: cls, error: classError } = await db
    .from("classes").select("id, section").eq("name", className).single();
  if (classError) throw new Error(`class "${className}": ${classError.message}`);

  const { data: list, error: listError } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;
  let user = list.users.find((u: { email?: string }) => u.email?.toLowerCase() === email);
  const existed = Boolean(user);
  if (!user) {
    const { data, error } = await db.auth.admin.createUser({
      email,
      email_confirm: true,
      password: randomBytes(24).toString("base64url"),
    });
    if (error) throw error;
    user = data.user;
  }

  const { data: profile } = await db.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (profile) {
    const { error } = await db.from("profiles")
      .update({ role: "student", section: cls.section, class_id: cls.id, is_active: true }).eq("id", user.id);
    if (error) throw error;
  } else {
    const { error } = await db.from("profiles").insert({
      id: user.id, full_name: name, role: "student", section: cls.section,
      class_id: cls.id, is_active: true, setup_complete: false,
    });
    if (error) throw error;
  }

  if (cls.section === "ustadhs") {
    const { count } = await db.from("surahs").select("number", { count: "exact", head: true });
    const { error } = await db.from("hifz_profiles").upsert(
      { student_id: user.id, start_surah: 114, target_count: count ?? 69 },
      { onConflict: "student_id", ignoreDuplicates: true },
    );
    if (error) throw error;
  }

  console.log(`${existed ? "updated" : "created"} ${email} in ${className} (${cls.section}). No email sent.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
