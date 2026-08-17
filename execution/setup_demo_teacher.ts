/**
 * setup_demo_teacher.ts — the demo cohort, and the training accounts on it.
 *
 * Run:  cd web && npx tsx ../execution/setup_demo_teacher.ts [--commit]
 *         ... --slot rezarta --email rezartabeka@outlook.com --name "Rezarta"
 * Without --commit it prints the plan and changes nothing.
 *
 * Four teachers join in October, all of them students here last year, and they
 * need somewhere to learn the app that is not the live register. So the twenty
 * demo students seeded by seed_demo.ts — minus the two now on loan to the real
 * Masjid Al-Haram — are split into four demo classes, one per new teacher, the
 * girls between the two sisters-side teachers and the boys between the two on
 * the brothers side. A class of five or six is what they will actually teach;
 * one class of eighteen would not have looked like the job.
 *
 * WHY A 'demo' SECTION, and it is the whole trick: the three leaderboard views
 * filter on `p.section = (select section from profiles where id = auth.uid())`.
 * A demo student left in 'sisters' appears by name and percentage on four real
 * teachers' Home screens; a demo student left inactive empties the demo
 * teacher's own register, because teacherRoster() filters on is_active. Putting
 * both sides in 'demo' isolates the cohort in both directions without editing a
 * single existing view, policy or query. Needs 0020_demo_section.sql first.
 *
 * The split is written out below rather than computed. "Half the girls" is a
 * decision, and a decision belongs in the file where it can be read and
 * changed — deriving it from a sort order means it silently moves the day a
 * student is renamed. Emails are the key for the same reason: names change.
 *
 * WHAT THIS DOES NOT DO. The demo scoping is the app's, not the database's.
 * RLS still grants every teacher the whole cohort, so a demo teacher's token
 * can read real rows through the API even though no screen offers them. The
 * page guards (roster, hifdh, marked homework) keep normal use inside their own
 * class; someone with devtools and intent is a different question, and closing
 * it means narrowing the policies the leaderboards depend on.
 *
 * Idempotent. Re-run it as each teacher arrives: the classes and the roster are
 * re-asserted, and an existing account keeps the password it already chose.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
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

const DOMAIN = "bsms-demo.test";

/**
 * The demo world. `from` records which real cohort each half came from — every
 * demo class sits in the 'demo' section regardless, since that is what keeps
 * them out of the real leaderboards.
 *
 * Kareem Bassett and Nuh Ferreira are deliberately absent: they were
 * reactivated into the real Masjid Al-Haram for testing and are not ours to
 * move. Everyone here is on the reserved `.test` TLD, so this can never sweep
 * up a real student by accident.
 */
const LAYOUT = [
  {
    slot: "rezarta",
    className: "Demo — Rezarta",
    from: "sisters",
    students: ["safiyya.t", "ruqayya.m", "halima.s", "nusayba.o", "jamila.v", "rabia.l"],
  },
  {
    slot: "sajeda",
    className: "Demo — Sajeda",
    from: "sisters",
    students: ["sumayya.a", "khadija.f", "amina.c", "zaynab.h", "fatima.n"],
  },
  {
    slot: "abdallah",
    className: "Demo — Abdallah",
    from: "brothers",
    students: ["adam.w", "bilal.o", "idris.k", "zayd.m"],
  },
  {
    slot: "ibrahim",
    className: "Demo — Ibrahim",
    from: "brothers",
    students: ["harun.d", "suleiman.n", "tariq.l"],
  },
] as const;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const COMMIT = process.argv.includes("--commit");
const SLOT = arg("slot");
const EMAIL = arg("email");
const NAME = arg("name");

if (SLOT && !LAYOUT.some((l) => l.slot === SLOT)) {
  console.error(`Unknown --slot ${SLOT}. One of: ${LAYOUT.map((l) => l.slot).join(", ")}`);
  process.exit(1);
}
if ((EMAIL || NAME || SLOT) && !(EMAIL && NAME && SLOT)) {
  console.error("--slot, --email and --name go together, or leave all three out to lay out the classes only.");
  process.exit(1);
}

/** A password they never need: setup_complete = false sends them to /welcome,
 *  which is where they choose their own. Printed in case the invitation email
 *  is not an option and you hand it over by hand. */
const TEMP_PASSWORD = `Bsms${randomBytes(4).toString("hex")}!Demo`;

type AuthUser = { id: string; email?: string };
/** The client here is untyped (it is required out of web/node_modules at
 *  runtime), so the rows this script reasons about get named explicitly. */
type ClassRow = { id: string; name: string; section: string; teacher_id: string | null };

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
  const authUsers = await allAuthUsers();
  const idByEmail = new Map(authUsers.map((u) => [(u.email ?? "").toLowerCase(), u.id]));

  const { data: classRows, error: classError } = await db
    .from("classes")
    .select("id, name, section, teacher_id");
  if (classError) throw new Error(classError.message);
  const classByName = new Map(
    ((classRows ?? []) as ClassRow[]).map((c) => [c.name, c] as const),
  );

  // Resolve the whole plan before writing any of it, so a typo in the layout is
  // a refusal rather than half a demo cohort.
  const plan = LAYOUT.map((l) => {
    const ids = l.students.map((handle) => {
      const id = idByEmail.get(`${handle}@${DOMAIN}`);
      if (!id) throw new Error(`no demo account for ${handle}@${DOMAIN}`);
      return { handle, id };
    });
    return { ...l, ids, existing: classByName.get(l.className) };
  });

  for (const p of plan) {
    console.log(
      `${p.className.padEnd(18)} ${p.existing ? "exists" : "will be created"} · ` +
        `${p.ids.length} demo students (${p.from} side)`,
    );
    for (const s of p.ids) console.log(`    ${s.handle}@${DOMAIN}`);
  }
  if (SLOT) {
    const target = plan.find((p) => p.slot === SLOT)!;
    const existingUser = idByEmail.get(EMAIL!.toLowerCase());
    console.log(
      `\nteacher  ${NAME} <${EMAIL}> → ${target.className} — ` +
        `${existingUser ? "exists, will be re-asserted" : "will be created"}`,
    );
  }

  if (!COMMIT) {
    console.log("\nDry run. Re-run with --commit to apply.");
    return;
  }

  for (const p of plan) {
    let classId = p.existing?.id;
    if (!classId) {
      const { data, error } = await db
        .from("classes")
        .insert({ name: p.className, section: "demo" })
        .select("id")
        .single();
      if (error) throw new Error(`create ${p.className}: ${error.message}`);
      classId = data.id;
      console.log(`created ${p.className}`);
    } else if (p.existing!.section !== "demo") {
      const { error } = await db.from("classes").update({ section: "demo" }).eq("id", classId);
      if (error) throw new Error(`${p.className} section: ${error.message}`);
    }

    const { error: rosterError } = await db
      .from("profiles")
      .update({ class_id: classId, section: "demo", is_active: true })
      .in("id", p.ids.map((s) => s.id));
    if (rosterError) throw new Error(`${p.className} roster: ${rosterError.message}`);
    console.log(`${p.className}: ${p.ids.length} students`);

    if (SLOT === p.slot) {
      let userId = idByEmail.get(EMAIL!.toLowerCase());
      if (!userId) {
        const { data, error } = await db.auth.admin.createUser({
          email: EMAIL!,
          password: TEMP_PASSWORD,
          email_confirm: true,
          user_metadata: { full_name: NAME },
        });
        if (error) throw new Error(`create user: ${error.message}`);
        userId = data.user.id;
        console.log(`created auth user ${EMAIL}`);
      }

      // Upserted, not inserted: an account that already exists — a re-run, or
      // someone who was a student here last year — gets its role and scope
      // re-asserted instead of erroring on the primary key.
      const { error: profileError } = await db.from("profiles").upsert({
        id: userId,
        full_name: NAME!,
        role: "teacher",
        section: "demo",
        class_id: classId,
        is_active: true,
        // They choose their own password and full name at /welcome; the setup
        // gate keeps sending them there until they have.
        setup_complete: false,
      });
      if (profileError) throw new Error(`profile: ${profileError.message}`);

      // A teacher is joined to their class from the classes row.
      // profiles.class_id is the STUDENT edge, and setting only that leaves the
      // class owned by whoever taught it before. Both are set here on purpose:
      // teacherClass() reads the owned class first and falls back to the profile.
      const { error: ownerError } = await db
        .from("classes")
        .update({ teacher_id: userId })
        .eq("id", classId);
      if (ownerError) throw new Error(`class owner: ${ownerError.message}`);

      console.log(`\n${NAME} now teaches ${p.className} (${p.ids.length} demo students).`);
      if (!idByEmail.has(EMAIL!.toLowerCase())) {
        console.log(`Temporary password: ${TEMP_PASSWORD}`);
        console.log("They choose their own the first time they sign in.");
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
