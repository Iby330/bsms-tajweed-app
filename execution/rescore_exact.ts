/**
 * Re-score the answers whose question stopped being `per_option` (0025).
 *
 *   npx tsx execution/rescore_exact.ts            # dry run, prints every change
 *   npx tsx execution/rescore_exact.ts --commit   # writes
 *
 * Uses the REAL `scoreObjective` out of web/src/lib/marking/objective.ts
 * rather than re-implementing all-or-nothing here or in SQL. That module is
 * pure and imports nothing, so it requires cleanly from outside web/ — no
 * `server-only` shim needed (see LEARNINGS on why that matters).
 *
 * Only touches rows whose mark actually moves, and only where the teacher has
 * not overridden: `final_marks != auto_marks` means a human decided, and a
 * scoring change is not a reason to overwrite them. Verified zero such rows
 * before 0025, but the guard belongs in the script, not in the moment.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { scoreObjective, parseOptions, parseResponse } from "../web/src/lib/marking/objective";

const COMMIT = process.argv.includes("--commit");

function env(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(join(__dirname, "../web/.env.local"), "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

async function main() {
  const e = env();
  const db = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // 0025 already flipped these to 'exact', so they are found by the homeworks
  // they belong to rather than by a scoring value that no longer distinguishes
  // them. The ids come from the migration's RETURNING output.
  const ids = process.argv.find((a) => a.startsWith("--ids="))?.slice(6).split(",");
  if (!ids?.length) throw new Error("pass --ids=<comma separated question ids>");

  const { data: questions, error: qErr } = await db
    .from("questions")
    .select("id, qtype, scoring, points, is_bonus, is_task, options, rubric")
    .in("id", ids);
  if (qErr) throw new Error(qErr.message);

  const { data: answers, error: aErr } = await db
    .from("answers")
    .select("id, question_id, response, auto_marks, final_marks")
    .in("question_id", ids);
  if (aErr) throw new Error(aErr.message);

  const byId = new Map(questions!.map((q: any) => [q.id, q]));
  const changes: { id: string; from: number; to: number }[] = [];
  let skippedOverride = 0;

  for (const a of answers as any[]) {
    const q = byId.get(a.question_id);
    if (!q) continue;
    const auto = a.auto_marks === null ? null : Number(a.auto_marks);
    const final = a.final_marks === null ? null : Number(a.final_marks);
    if (auto !== null && final !== null && Math.abs(auto - final) > 1e-9) {
      skippedOverride += 1; // a human decided this one
      continue;
    }
    const scored = scoreObjective(
      {
        qtype: q.qtype,
        scoring: q.scoring,
        points: Number(q.points),
        is_bonus: q.is_bonus,
        is_task: q.is_task,
        options: parseOptions(q.options),
        rubric: null,
      },
      parseResponse(a.response),
    );
    if (scored === null) continue; // not machine-markable
    if (final !== null && Math.abs(scored - final) < 1e-9) continue;
    changes.push({ id: a.id, from: final ?? 0, to: scored });
  }

  console.log(`${answers!.length} answers on ${questions!.length} questions`);
  console.log(`  skipped (teacher override): ${skippedOverride}`);
  console.log(`  changing: ${changes.length}`);
  const net = changes.reduce((s, c) => s + (c.to - c.from), 0);
  console.log(`  net mark change: ${net >= 0 ? "+" : ""}${net.toFixed(1)}`);

  if (!COMMIT) {
    console.log("\nDry run. Re-run with --commit to write.");
    return;
  }
  for (const c of changes) {
    const { error } = await db
      .from("answers")
      .update({ auto_marks: c.to, final_marks: c.to })
      .eq("id", c.id);
    if (error) throw new Error(`${c.id}: ${error.message}`);
  }
  console.log(`\nwrote ${changes.length} answers.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
