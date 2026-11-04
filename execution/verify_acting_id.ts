/**
 * verify_acting_id.ts: what each kind of user can see, as row counts.
 *
 *   npx --prefix web tsx execution/verify_acting_id.ts --save before.json
 *   npx --prefix web tsx execution/verify_acting_id.ts --compare before.json
 *
 * Reads only. A multi-statement batch runs as one implicit transaction, so
 * SET LOCAL holds until the final SELECT, whose rows the API returns.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const repo = join(__dirname, "..");
const env: Record<string, string> = {};
for (const file of ["web/.env.local", ".env"]) {
  let text = "";
  try {
    text = readFileSync(join(repo, file), "utf8");
  } catch {
    continue;
  }
  for (const line of text.split("\n")) {
    const i = line.indexOf("=");
    // An inline comment isn't part of the value (see loadEnv in apply_migration.ts).
    if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).split(" #")[0].trim();
  }
}
const token = process.env.SUPABASE_ACCESS_TOKEN ?? env.SUPABASE_ACCESS_TOKEN;
const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];

async function sql(query: string) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${body}`);
  return JSON.parse(body) as Record<string, unknown>[];
}

/** Picked by what they are, so the script needs no ids or emails in the repo. */
const PERSONAS: Record<string, string> = {
  student: `select id from profiles where role='student' and is_active and section='brothers' and class_id is not null order by created_at limit 1`,
  teacher: `select teacher_id as id from classes where name='Masjid Al-Aqsa'`,
  sisters_teacher: `select teacher_id as id from classes where name='Hareer'`,
  admin: `select id from profiles where is_admin limit 1`,
};

async function main() {
  const objects = await sql(`
    select c.relname from pg_class c
     where c.relnamespace='public'::regnamespace
       and ((c.relkind='r' and c.relrowsecurity) or (c.relkind='v' and c.relname like 'v\\_%'))
       and has_table_privilege('authenticated', c.oid, 'SELECT')
     order by 1`);
  const names = objects.map((o) => o.relname as string);
  const out: Record<string, Record<string, number | string>> = {};
  for (const [persona, pick] of Object.entries(PERSONAS)) {
    const [{ id }] = await sql(pick);
    const claims = JSON.stringify({ sub: id, role: "authenticated" });
    // One batch per persona, one row per object: far fewer API calls than one
    // each, and the same implicit transaction holds the claims for all of them.
    const union = names
      .map((n) => `select '${n}' as name, count(*)::int as n from public."${n}"`)
      .join(" union all ");
    const rows = await sql(`
      set local role authenticated;
      select set_config('request.jwt.claims', '${claims}', true);
      ${union};`);
    out[persona] = Object.fromEntries(rows.map((r) => [r.name as string, r.n as number]));
  }
  const mode = process.argv[2];
  const file = process.argv[3];
  if (mode === "--save") {
    writeFileSync(file, JSON.stringify(out, null, 2));
    console.log(`saved ${names.length} objects for ${Object.keys(out).length} personas`);
    for (const p of Object.keys(out)) console.log(` ${p}: profiles=${out[p].profiles}`);
    return;
  }
  const before = JSON.parse(readFileSync(file, "utf8"));
  let diffs = 0;
  for (const p of Object.keys(out)) {
    for (const n of names) {
      if (before[p]?.[n] !== out[p][n]) {
        diffs++;
        console.log(`${p} ${n}: ${before[p]?.[n]} -> ${out[p][n]}`);
      }
    }
  }
  console.log(diffs ? `${diffs} differences` : "identical");
  process.exit(diffs ? 1 : 0);
}
main();
