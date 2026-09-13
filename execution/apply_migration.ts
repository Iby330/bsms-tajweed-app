/**
 * Apply a SQL migration to the hosted Supabase project.
 *
 *   npx tsx execution/apply_migration.ts web/supabase/migrations/0007_x.sql
 *   npx tsx execution/apply_migration.ts --check          # list applied migrations
 *   npx tsx execution/apply_migration.ts --probe "select 1"      # run SQL, no ledger row
 *   npx tsx execution/apply_migration.ts --probe scratch/q.sql   # same, from a file
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
 *  - This file lives outside web/, so `tsx` compiles it as CJS, which rejects
 *    top-level await ("Top-level await is currently not supported with the
 *    cjs output format"). Keep all logic inside main() rather than switching
 *    to bare top-level awaits.
 *  - A successful HTTP response does NOT mean the SQL did anything: an UPDATE
 *    that matches zero rows (e.g. because it targets a title/id that drifted
 *    from what the migration author expected) still returns 201. Prefer
 *    writing migrations that target rows by stable identity (position/id),
 *    not by matching mutable text, and consider a RETURNING clause on data
 *    migrations so the printed result below isn't just `[]`.
 *  - Never run an ad-hoc / read-only query by handing this script a temp file:
 *    every applied file gets a `schema_migrations` row named after it, so a
 *    throwaway `q.sql` leaves junk in the ledger, and the delete you write to
 *    clean it up leaves its own row in turn (the insert is `on conflict
 *    (filename) do update set applied_at = now()`, so the loop only closes by
 *    reusing the name of a real migration). Use `--probe` instead: it sends the
 *    SQL and prints the full result without touching the ledger — and it is
 *    also how you delete a junk row that a pre-`--probe` session left behind.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const PROJECT_REF = "ssqeakiutclbiwizrchh";

/**
 * Read .env into a map.
 *
 * The value has to be cleaned, not just trimmed. A line like
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_abc123  # personal access token, rotate yearly
 *
 * is ordinary dotenv, and taking everything after the "=" sends the comment
 * as part of the token. The Management API then answers 401 with "Format is
 * Authorization: Bearer [token]", which reads like an expired credential and
 * sent a whole session looking at the wrong thing. Only lines STARTING with
 * "#" were being skipped; inline comments were not.
 *
 * Rules, matching dotenv: a quoted value is taken whole, an unquoted one ends
 * at the first whitespace-preceded "#".
 */
function loadEnv(): Record<string, string> {
  return Object.fromEntries(
    readFileSync(resolve(ROOT, ".env"), "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        const key = l.slice(0, i).trim();
        const raw = l.slice(i + 1).trim();
        const quoted = /^(["'])(.*)\1$/.exec(raw);
        return [key, quoted ? quoted[2] : raw.split(/\s+#/)[0].trim()];
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

function summarize(result: unknown): string {
  const s = JSON.stringify(result);
  if (s === undefined) return String(result);
  return s.length > 500 ? `${s.slice(0, 500)}… (${s.length} chars total)` : s;
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
  const probe = args.includes("--probe");
  const files = args.filter((a) => !a.startsWith("--"));

  // Ad-hoc query mode: run the SQL and print what came back, writing NOTHING to
  // schema_migrations (and not even creating it). Each argument is a file path
  // if one exists at it, otherwise it is taken as SQL text, so a one-off probe
  // needs no temp file at all.
  if (probe) {
    if (files.length === 0) throw new Error("--probe needs SQL text or a .sql file path");
    for (const arg of files) {
      const path = resolve(ROOT, arg);
      const sql = existsSync(path) && statSync(path).isFile() ? readFileSync(path, "utf8") : arg;
      const result = await runSql(token, sql);
      console.log(JSON.stringify(result, null, 2));
    }
    return;
  }

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
    const result = await runSql(token, sql);
    await runSql(
      token,
      `insert into schema_migrations (filename) values ('${name.replace(/'/g, "''")}')
       on conflict (filename) do update set applied_at = now()`,
    );
    console.log(`ok    ${name}`);
    // Surface whatever the API handed back instead of discarding it. Note the
    // limit: a bare UPDATE returns [] whether it matched 24 rows or none, so
    // this alone does NOT prove a data migration did anything — add RETURNING
    // to make it meaningful, and verify data migrations with a separate query.
    console.log(`      result: ${summarize(result)}`);
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
