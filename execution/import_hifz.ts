/**
 * import_hifz.ts — turn last year's hifdh COUNTS into per-surah records.
 *
 * Run:  cd web && npx tsx ../execution/import_hifz.ts <hifz_payload.json> [--commit]
 * Without --commit it prints the plan and changes nothing.
 *
 * The spreadsheet records a count ("43 of 43"), not a list. That is enough,
 * because the run is a fixed order: memorisation starts at An-Nas and works
 * backwards, so a count of N means exactly surahs 114 down to 115-N and there
 * is nothing to guess. `surahs.order_index` already encodes it — 114 is 1,
 * Al-Jinn (72) is 43, Al-Mulk (67) is 48.
 *
 * passed_at is the one thing the sheet genuinely does not hold: it never
 * recorded WHEN a surah was passed, only that it had been. Rather than spread
 * invented dates across the year, every carried-over record shares the import
 * date and says so in teacher_comment, so a teacher reading a student's page
 * can see at a glance which rows are history and which were marked in the app.
 */

import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
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
const CARRIED_OVER = "Carried over from the 2025/26 master spreadsheet. The original pass date was not recorded.";

type Row = { student_id: string; name: string; passed: number; surahs: number[] };

async function main() {
  const path = process.argv[2];
  if (!path || path.startsWith("--")) {
    console.error("usage: import_hifz.ts <hifz_payload.json> [--commit]");
    process.exit(1);
  }
  const rows: Row[] = JSON.parse(readFileSync(resolve(path), "utf8"));
  console.log(COMMIT ? "COMMITTING\n" : "DRY RUN — pass --commit to apply\n");

  // Every surah referenced must exist: surah_number is a foreign key, and a
  // missing one fails the whole batch rather than the single row.
  const { data: surahs } = await db.from("surahs").select("number");
  const known = new Set<number>((surahs ?? []).map((s: { number: number }) => s.number));
  const missing = [...new Set(rows.flatMap((r) => r.surahs))].filter((n) => !known.has(n));
  if (missing.length) {
    console.error(`surahs table is missing: ${missing.sort((a, b) => b - a).join(", ")}`);
    console.error("apply migration 0018 first.");
    process.exit(1);
  }

  const today = new Date().toISOString().slice(0, 10);
  const records = rows.flatMap((r) =>
    r.surahs.map((n) => ({
      student_id: r.student_id, surah_number: n,
      passed_at: today, teacher_comment: CARRIED_OVER,
    })),
  );

  console.log(`students  ${rows.length}`);
  console.log(`records   ${records.length}`);
  console.log(`deepest   surah ${Math.min(...records.map((r) => r.surah_number))}`);
  if (!COMMIT) { console.log("\nNothing was written."); return; }

  // Idempotent, and scoped: only rows this importer wrote are cleared, so a
  // surah a teacher marks in the app afterwards is never swept away.
  const ids = rows.map((r) => r.student_id);
  const { error: delErr } = await db
    .from("hifz_records").delete().in("student_id", ids).eq("teacher_comment", CARRIED_OVER);
  if (delErr) throw delErr;

  for (let i = 0; i < records.length; i += 500) {
    const { error } = await db.from("hifz_records").insert(records.slice(i, i + 500));
    if (error) throw error;
  }
  console.log("\nDone.");
}

main().catch((e) => { console.error(e); process.exit(1); });
