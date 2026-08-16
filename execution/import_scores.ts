/**
 * import_scores.ts — carry last year's results in from the master spreadsheet.
 *
 * Run:  cd web && npx tsx ../execution/import_scores.ts <payload.json> [--commit]
 * Without --commit it prints the plan and changes nothing.
 *
 * The payload is [{ student_id, name, class, hw: {n: score}, exam: {term: score},
 * hifdh_target }], built by matching the spreadsheet's per-class score sheets to
 * the roster. Matching happens BEFORE this script, on purpose: the sheets
 * abbreviate ("Mo Elsaygh", "Ibrahim R"), and a name guess that lands on the
 * wrong student writes someone else's marks onto a real child's record. The
 * mapping is reviewed as a CSV first and arrives here already resolved to ids.
 *
 * Homework marks land in submissions.imported_marks rather than being spread
 * across per-question answers. Google Forms only ever exported a total, so
 * per-question marks do not exist for last year — inventing them to fit the
 * shape of the view would put fabricated numbers in front of a teacher marking
 * a real student. See migration 0017.
 *
 * NOT imported, because the source does not contain it:
 *  - attendance: absent from the spreadsheet entirely.
 *  - which surahs were passed: the sheet records a COUNT (43 of 43), and
 *    hifz_records is one row per surah. The target is imported; the passes are
 *    not, because choosing 43 surahs to invent would be fiction.
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
const payloadPath = process.argv[2];

type Row = {
  student_id: string; name: string; class: string | null;
  hw: Record<string, number>; exam: Record<string, number>;
  hifdh_target: number | null;
};

async function main() {
  if (!payloadPath || payloadPath.startsWith("--")) {
    console.error("usage: import_scores.ts <payload.json> [--commit]");
    process.exit(1);
  }
  const rows: Row[] = JSON.parse(readFileSync(resolve(payloadPath), "utf8"));
  console.log(COMMIT ? "COMMITTING\n" : "DRY RUN — pass --commit to apply\n");

  const { data: hws } = await db.from("homeworks").select("id, number, total_marks");
  const byNumber = new Map<number, { id: string; total_marks: number }>(
    (hws ?? []).map((h: { id: string; number: number; total_marks: number }) => [h.number, h]),
  );

  const subs: Record<string, unknown>[] = [];
  const exams: Record<string, unknown>[] = [];
  const hifdh: Record<string, unknown>[] = [];
  let skipped = 0;

  for (const r of rows) {
    for (const [numStr, score] of Object.entries(r.hw)) {
      const hw = byNumber.get(Number(numStr));
      if (!hw) { console.log(`  ! ${r.name}: no homework #${numStr}`); skipped++; continue; }
      if (score > Number(hw.total_marks)) {
        console.log(`  ! ${r.name} HW${numStr}: ${score} > ${hw.total_marks}`); skipped++; continue;
      }
      subs.push({
        homework_id: hw.id, student_id: r.student_id,
        status: "approved", imported_marks: score,
      });
    }
    for (const [term, score] of Object.entries(r.exam)) {
      exams.push({ student_id: r.student_id, term_id: Number(term), score });
    }
    if (r.hifdh_target) {
      // start_surah 114 counting backwards is the programme's default shape;
      // only the target is known from the sheet, so nothing else is asserted.
      hifdh.push({ student_id: r.student_id, start_surah: 114,
                   target_count: r.hifdh_target, is_custom: false });
    }
  }

  console.log(`students      ${rows.length}`);
  console.log(`submissions   ${subs.length}${skipped ? `  (${skipped} skipped)` : ""}`);
  console.log(`exam scores   ${exams.length}`);
  console.log(`hifz profiles ${hifdh.length}`);

  if (!COMMIT) { console.log("\nNothing was written."); return; }

  // Idempotent: clear only rows this importer owns, never anything the app
  // marked itself (those have imported_marks null and real answer rows).
  const ids = rows.map((r) => r.student_id);
  const { error: delErr } = await db
    .from("submissions").delete().in("student_id", ids).not("imported_marks", "is", null);
  if (delErr) throw delErr;

  for (let i = 0; i < subs.length; i += 500) {
    const { error } = await db.from("submissions").insert(subs.slice(i, i + 500));
    if (error) throw error;
  }
  const { error: exErr } = await db
    .from("exam_scores").upsert(exams, { onConflict: "student_id,term_id" });
  if (exErr) throw exErr;
  const { error: hfErr } = await db
    .from("hifz_profiles").upsert(hifdh, { onConflict: "student_id" });
  if (hfErr) throw hfErr;

  console.log("\nDone.");
}

main().catch((e) => { console.error(e); process.exit(1); });
