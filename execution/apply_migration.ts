/**
 * Apply a SQL migration to the hosted Supabase project.
 *
 *   npx tsx execution/apply_migration.ts web/supabase/migrations/0007_x.sql
 *   npx tsx execution/apply_migration.ts --check          # list applied migrations
 *
 * Uses the Management API's query endpoint with SUPABASE_ACCESS_TOKEN, because
 * the Supabase CLI isn't installed on this machine and `psql` would need the
 * pooler host + DB password. The whole file is sent as one statement batch, so
 * a migration either lands or it doesn't.
 *
 * Migrations are recorded in a `schema_migrations` table keyed by filename, and
 * re-applying one that's already recorded is refused — pass --force to override
 * (only safe when every statement is idempotent).
 *
 * Gotchas learned the hard way:
 *  - The endpoint returns 201 with a JSON array on success; errors come back as
 *    4xx with {message}. Non-2xx must be treated as failure, not empty output.
 *  - Write every statement idempotently (if not exists / drop … if exists) so a
 *    half-applied batch can be re-run.
 */
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const PROJECT_REF = "ssqeakiutclbiwizrchh";

function loadEnv(): Record<string, string> {
  return Object.fromEntries(
    readFileSync(resolve(ROOT, ".env"), "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
}

async function runSql(token: string, query: string): Promise<unknown> {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    },
  );
  const body = await res.text();
  if (!res.ok) throw new Error(`SQL failed (${res.status}): ${body}`);
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

const LEDGER = `create table if not exists schema_migrations (
  filename text primary key,
  applied_at timestamptz not null default now()
)`;

async function main() {
  const env = loadEnv();
  const token = env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error("SUPABASE_ACCESS_TOKEN missing from .env");

  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const files = args.filter((a) => !a.startsWith("--"));

  await runSql(token, LEDGER);

  if (args.includes("--check") || files.length === 0) {
    const rows = await runSql(token, "select filename, applied_at from schema_migrations order by filename");
    console.log("applied migrations:");
    for (const r of rows as { filename: string; applied_at: string }[]) {
      console.log(`  ${r.filename}  ${r.applied_at}`);
    }
    return;
  }

  for (const file of files) {
    const path = resolve(ROOT, file);
    const name = basename(path);

    const already = (await runSql(
      token,
      `select count(*)::int as n from schema_migrations where filename = '${name.replace(/'/g, "''")}'`,
    )) as { n: number }[];
    if (already[0]?.n > 0 && !force) {
      console.log(`skip  ${name} — already applied (--force to re-run)`);
      continue;
    }

    const sql = readFileSync(path, "utf8");
    await runSql(token, sql);
    await runSql(
      token,
      `insert into schema_migrations (filename) values ('${name.replace(/'/g, "''")}')
       on conflict (filename) do update set applied_at = now()`,
    );
    console.log(`ok    ${name}`);
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
