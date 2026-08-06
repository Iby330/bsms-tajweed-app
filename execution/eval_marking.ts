/**
 * eval_marking.ts — how close is the marking engine to the real 2025/26 marks?
 *
 * Reads   Tajweed Master Spreadsheet 2025_26/*.html   (LOCAL ONLY — real pupils)
 *         questions/rubrics/keys from Supabase
 * Emits   docs/eval-report.md                          (numbers only, no names)
 *
 * Run:    cd web && npx tsx ../execution/eval_marking.ts            # sampled
 *         cd web && npx tsx ../execution/eval_marking.ts --all      # everything
 *         cd web && npx tsx ../execution/eval_marking.ts --hw 11 --limit 5
 *
 * METHOD — and its one important limitation.
 * Google Forms only ever exported a TOTAL per response, never a per-question
 * mark. So the comparison is total-vs-total, and it is only fair on homeworks
 * the engine can mark unaided end to end. Any homework containing a grid
 * question (no answer key) or a free-text question with no rubric is excluded
 * outright — scoring those would count a question the engine never claimed to
 * mark, and would flatter or punish the result for the wrong reason. Excluded
 * homeworks are listed in the report rather than quietly dropped.
 *
 * PRIVACY: pupil names and emails are in columns 2 and 4 of every sheet. They
 * are never read into the comparison, never sent to Groq (only question text,
 * rubric and the answer go), and never written to the report.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";
import {
  scoreObjective,
  parseOptions,
  parseRubric,
  type MarkableQuestion,
  type QuestionOption,
  type RubricConcept,
} from "../web/src/lib/marking/objective.ts";

/**
 * `llm.ts` opens with `import "server-only"`, which exists to stop the marking
 * prompt and API key reaching a browser bundle. That guard throws in a plain
 * Node process, so satisfy it with an empty module before loading the marker.
 * We are deliberately reusing the SAME module the app marks with — a copy here
 * would drift from production and quietly make this report meaningless.
 */
const requireFrom = createRequire(import.meta.url);
const serverOnly = requireFrom.resolve("server-only");
requireFrom.cache[serverOnly] = new (require("node:module").Module)(serverOnly) as never;
requireFrom.cache[serverOnly]!.exports = {};
requireFrom.cache[serverOnly]!.loaded = true;

const { markFreeText } = requireFrom("../web/src/lib/marking/llm.ts") as {
  markFreeText: typeof import("../web/src/lib/marking/llm.ts").markFreeText;
};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SHEETS = join(ROOT, "Tajweed Master Spreadsheet 2025_26");
const REPORT = join(ROOT, "docs", "eval-report.md");

/** Sheet filename → homework number. H1..H8 are the first eight. */
function homeworkNumber(file: string): number | null {
  const m = file.match(/^H(?:W )?\s*(\d+)\.html$/i);
  return m ? Number(m[1]) : null;
}

// ───────────────────────── sheet parsing ─────────────────────────

type Sheet = { header: string[]; rows: string[][] };

function parseSheet(path: string): Sheet {
  const html = readFileSync(path, "utf8");
  const table = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) =>
    [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) =>
      c[1]
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim(),
    ),
  );
  // row 0 is the A/B/C column ruler, row 1 the Forms header, rest are responses
  return { header: table[1] ?? [], rows: table.slice(2).filter((r) => r[1]) };
}

/** "12 / 15" → 12 */
function parseScore(cell: string): number | null {
  const m = cell?.match(/^\s*([\d.]+)\s*\/\s*[\d.]+\s*$/);
  return m ? Number(m[1]) : null;
}

const norm = (s: string) =>
  s.toLowerCase().replace(/\s+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "").trim();

// ───────────────────────── answer → response ─────────────────────────

/**
 * Turn a spreadsheet cell into the {selected} shape the marker expects.
 *
 * Checkbox cells are a comma-joined list, but option text contains commas too
 * ("1 (Least heavy), 5 (Most Heavy)" is two picks, not four). Matching longest
 * option first and consuming the matched span avoids both the comma problem and
 * short options matching inside longer ones.
 */
function selectionsFor(cell: string, options: QuestionOption[]): number[] {
  let remaining = ` ${norm(cell)} `;
  const picks: number[] = [];
  const byLength = [...options].sort(
    (a, b) => norm(b.value ?? b.label).length - norm(a.value ?? a.label).length,
  );
  for (const o of byLength) {
    const needle = norm(o.value ?? o.label);
    if (!needle) continue;
    const at = remaining.indexOf(needle);
    if (at === -1) continue;
    picks.push(o.position);
    remaining = remaining.slice(0, at) + " " + remaining.slice(at + needle.length);
  }
  return picks.sort((a, b) => a - b);
}

// ───────────────────────── main ─────────────────────────

type DbQuestion = MarkableQuestion & { id: string; prompt: string; position: number };

async function main() {
  const args = process.argv.slice(2);
  const runAll = args.includes("--all");
  const debug = args.includes("--debug");
  const breakdown = args.includes("--breakdown");
  const hwFilter = args.includes("--hw") ? Number(args[args.indexOf("--hw") + 1]) : null;
  const perHwLimit = args.includes("--limit")
    ? Number(args[args.indexOf("--limit") + 1])
    : runAll
      ? Infinity
      : 6;

  // Same convention as seed_demo.ts: read web/.env.local directly rather than
  // relying on the runner to have loaded it.
  for (const line of readFileSync(join(ROOT, "web/.env.local"), "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i > 0 && !line.trim().startsWith("#")) {
      process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim();
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from web/.env.local");
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is not set");
  const db = createClient(url, key);

  if (!existsSync(SHEETS)) throw new Error(`Missing ${SHEETS} — the real gradebook is local-only.`);

  const { data: homeworks } = await db
    .from("homeworks")
    .select("id, number, total_marks")
    .order("number");
  const { data: allQuestions } = await db
    .from("questions")
    .select("id, homework_id, position, prompt, qtype, scoring, points, is_bonus, is_task, options, rubric, needs_key")
    .order("position");

  const qByHw = new Map<string, DbQuestion[]>();
  for (const q of allQuestions ?? []) {
    const list = qByHw.get(q.homework_id) ?? [];
    list.push({
      id: q.id,
      prompt: q.prompt,
      position: q.position,
      qtype: q.qtype as never,
      scoring: q.scoring as never,
      points: Number(q.points),
      is_bonus: q.is_bonus,
      is_task: q.is_task,
      options: parseOptions(q.options),
      rubric: parseRubric(q.rubric),
    });
    qByHw.set(q.homework_id, list);
  }

  type Row = {
    hw: number;
    expected: number;
    got: number;
    /** Split so a disagreement can be blamed on the right half of the engine. */
    objective: number;
    freeText: number;
    llmCalls: number;
    unmarkable: boolean;
    /** Why this response was dropped, so the report can't hide a silent skew. */
    dropReason?: string;
  };
  const results: Row[] = [];
  const excluded: { hw: number; why: string }[] = [];
  let skippedNoSheet = 0;

  /** Per-question tally, for working out WHICH question in a bad homework drifts. */
  type QStat = { hw: number; position: number; qtype: string; points: number; awarded: number[] };
  const qStats = new Map<string, QStat>();

  const files = readdirSync(SHEETS).filter((f) => homeworkNumber(f) !== null);

  for (const file of files.sort((a, b) => homeworkNumber(a)! - homeworkNumber(b)!)) {
    const number = homeworkNumber(file)!;
    if (hwFilter !== null && number !== hwFilter) continue;

    const hw = (homeworks ?? []).find((h) => h.number === number);
    if (!hw) {
      skippedNoSheet += 1;
      continue;
    }
    const questions = qByHw.get(hw.id) ?? [];

    // Exclusion rule: the engine must be able to mark EVERY graded question in
    // the homework unaided, otherwise total-vs-total is not a like comparison.
    // Three ways a question fails that, all of them content gaps rather than
    // engine faults — and each is named in the report.
    const reasonBlocked = (q: DbQuestion): string | null => {
      if (q.is_task || q.points === 0) return null;
      if (q.scoring === "manual" || q.qtype === "grid") return "grid question with no answer key";
      if (q.qtype === "text" || q.qtype === "paragraph") {
        return q.rubric && q.rubric.length > 0 ? null : "free-text question with no rubric";
      }
      // mcq / checkbox: scoreObjective refuses to guess when no option is
      // flagged correct, so the homework can't be scored end to end either.
      return (q.options ?? []).some((o) => o.correct)
        ? null
        : `${q.qtype} question with no answer key recorded`;
    };

    const blocking = questions.map(reasonBlocked).filter((r): r is string => r !== null);
    if (blocking.length > 0) {
      excluded.push({ hw: number, why: [...new Set(blocking)].join("; ") });
      continue;
    }

    const sheet = parseSheet(join(SHEETS, file));

    // Map each sheet column to a question by prompt text.
    const colOf = new Map<string, number>();
    sheet.header.forEach((h, i) => {
      if (i < 5 || !h) return; // 0 ruler, 1 timestamp, 2 email, 3 score, 4 name
      colOf.set(norm(h), i);
    });

    const pairs = questions
      .map((q) => ({ q, col: colOf.get(norm(q.prompt)) }))
      .filter((p): p is { q: DbQuestion; col: number } => p.col !== undefined);

    if (pairs.length === 0) {
      excluded.push({ hw: number, why: "no columns matched the imported questions" });
      continue;
    }

    let done = 0;
    for (const row of sheet.rows) {
      if (done >= perHwLimit) break;
      const expected = parseScore(row[3] ?? "");
      if (expected === null) continue;

      let got = 0;
      let objectiveGot = 0;
      let freeTextGot = 0;
      let llmCalls = 0;
      let unmarkable = false;
      let dropReason: string | undefined;

      for (const { q, col } of pairs) {
        if (q.is_bonus) continue; // official totals exclude the bonus round

        // Zero-mark items — practical tasks, and the acknowledgement questions
        // Forms is full of ("Quick reminder! …", "Yes I will do it now!") —
        // cannot move the total either way, and none of them carry an answer
        // key or rubric. Scoring them returns null and wrongly condemns the
        // whole response as unmarkable, which is what silently binned half the
        // sample on the first run.
        if (q.is_task || q.points === 0) continue;

        const cell = row[col] ?? "";
        let awarded = 0;

        if (q.qtype === "text" || q.qtype === "paragraph") {
          const marked = await markFreeText({
            prompt: q.prompt,
            rubric: q.rubric as RubricConcept[],
            answer: cell,
          });
          llmCalls += 1;
          if (marked === null) {
            unmarkable = true;
            dropReason ??= "model declined to mark a free-text answer (rate limit or bad reply)";
            continue;
          }
          awarded = Math.min(marked.marks, q.points);
          freeTextGot += awarded;
        } else {
          const score = scoreObjective(q, { selected: selectionsFor(cell, q.options ?? []) });
          if (score === null) {
            unmarkable = true;
            dropReason ??= `no answer key for a ${q.qtype} question`;
          } else awarded = score;
          objectiveGot += awarded;
        }
        got += awarded;

        const statKey = `${number}:${q.position}`;
        const stat = qStats.get(statKey) ?? {
          hw: number,
          position: q.position,
          qtype: q.qtype,
          points: q.points,
          awarded: [],
        };
        stat.awarded.push(awarded);
        qStats.set(statKey, stat);

        if (debug) {
          console.log(
            `\n    Q${q.position} [${q.qtype}/${q.scoring}] worth ${q.points} → awarded ${awarded}` +
              `\n      answer: ${cell.slice(0, 80)}` +
              (q.options ? `\n      picked positions: ${JSON.stringify(selectionsFor(cell, q.options))}` +
                `\n      key positions:    ${JSON.stringify(q.options.filter((o) => o.correct).map((o) => o.position))}` : ""),
          );
        }
      }
      if (debug) console.log(`\n    TOTAL got ${got} vs recorded ${expected}\n`);

      results.push({
        hw: number,
        expected,
        got: Math.round(got * 100) / 100,
        objective: Math.round(objectiveGot * 100) / 100,
        freeText: Math.round(freeTextGot * 100) / 100,
        llmCalls,
        unmarkable,
        dropReason,
      });
      done += 1;
      process.stdout.write(
        `\r  HW ${String(number).padStart(2)} · ${results.length} responses marked…   `,
      );
    }
  }
  process.stdout.write("\n");

  // ───────────────────────── report ─────────────────────────

  const usable = results.filter((r) => !r.unmarkable);
  const delta = (r: Row) => r.got - r.expected;
  const within = (n: number) => usable.filter((r) => Math.abs(delta(r)) <= n).length;
  const pct = (n: number) => (usable.length ? (100 * n) / usable.length : 0);
  const mae = usable.length
    ? usable.reduce((s, r) => s + Math.abs(delta(r)), 0) / usable.length
    : 0;
  const bias = usable.length ? usable.reduce((s, r) => s + delta(r), 0) / usable.length : 0;

  const byHw = [...new Set(usable.map((r) => r.hw))].sort((a, b) => a - b);
  const perHwRows = byHw.map((n) => {
    const rows = usable.filter((r) => r.hw === n);
    const ok = rows.filter((r) => Math.abs(delta(r)) <= 1).length;
    const m = rows.reduce((s, r) => s + Math.abs(delta(r)), 0) / rows.length;
    return `| ${n} | ${rows.length} | ${ok} | ${((100 * ok) / rows.length).toFixed(0)}% | ${m.toFixed(2)} |`;
  });

  const passed = pct(within(1)) >= 85;
  const md = `# Marking engine — accuracy against the real 2025/26 marks

_Generated by \`execution/eval_marking.ts\`. Numbers only: no pupil names, emails
or answers appear here, and none were sent anywhere except the answer text
required to mark it._

## Method

Each historical Google Forms response is re-marked by the engine and its total
compared with the mark that response actually received. Forms only ever recorded
a **total** per response, so the comparison is total-vs-total.

A homework is only included when the engine can mark **every** graded question in
it unaided. Homeworks containing a grid question (no answer key was ever
recorded) or a free-text question with no rubric are excluded — marking those
would score questions the engine does not claim to handle.

## Result

**${pct(within(1)).toFixed(1)}% of responses land within ±1 mark** (gate: ≥85%) — ${passed ? "**PASS**" : "**FAIL**"}

| Measure | Value |
| --- | --- |
| Responses compared | ${usable.length} |
| Homeworks compared | ${byHw.length} |
| Exact match | ${within(0)} (${pct(within(0)).toFixed(1)}%) |
| Within ±0.5 | ${within(0.5)} (${pct(within(0.5)).toFixed(1)}%) |
| Within ±1 | ${within(1)} (${pct(within(1)).toFixed(1)}%) |
| Within ±2 | ${within(2)} (${pct(within(2)).toFixed(1)}%) |
| Mean absolute error | ${mae.toFixed(2)} marks |
| Mean signed error | ${bias >= 0 ? "+" : ""}${bias.toFixed(2)} marks ${bias > 0.25 ? "(engine marks generously)" : bias < -0.25 ? "(engine marks harshly)" : "(no strong bias)"} |

## By homework

| HW | Responses | Within ±1 | Rate | Mean abs. error |
| --- | --- | --- | --- | --- |
${perHwRows.join("\n")}

## Excluded homeworks

${
  excluded.length
    ? excluded
        .sort((a, b) => a.hw - b.hw)
        .map((e) => `- **HW ${e.hw}** — ${e.why}`)
        .join("\n")
    : "_None._"
}

## Dropped responses

${
  results.length - usable.length > 0
    ? `${results.length - usable.length} of ${results.length} responses could not be scored end to end and are excluded from every number above:\n\n` +
      Object.entries(
        results
          .filter((r) => r.unmarkable)
          .reduce<Record<string, number>>((acc, r) => {
            const k = r.dropReason ?? "unknown";
            acc[k] = (acc[k] ?? 0) + 1;
            return acc;
          }, {}),
      )
        .sort((a, b) => b[1] - a[1])
        .map(([why, n]) => `- ${n} × ${why}`)
        .join("\n") +
      `\n\nIn the app these land in the teacher's manual-marking queue rather than being lost. A high count here usually means the free Groq tier rate-limited the run, not that the engine failed — re-run to confirm.`
    : "_None — every sampled response was scored end to end._"
}

## Reading this

±1 mark is the bar because homework is 20% of a term grade and a term is 80%
exam — a single mark of drift on one homework moves a final percentage by
hundredths. What matters more is the bias row: a consistent lean in one
direction would show up as unfair across a cohort, where scatter would not.
`;

  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, md);

  if (breakdown) {
    console.log("\n─── where the disagreement sits ───");
    console.log(
      "HW  n   recorded  engine   objective  free-text   verdict",
    );
    for (const n of byHw) {
      const rows = usable.filter((r) => r.hw === n);
      const avg = (f: (r: Row) => number) => rows.reduce((s, r) => s + f(r), 0) / rows.length;
      const exp = avg((r) => r.expected);
      const obj = avg((r) => r.objective);
      const ft = avg((r) => r.freeText);
      const drift = avg((r) => r.got) - exp;

      // The objective half is deterministic table lookup — if it alone already
      // overshoots the recorded mark, no amount of prompt work will help.
      const verdict =
        Math.abs(drift) < 0.35
          ? "matches"
          : obj > exp + 0.35
            ? "ANSWER KEY — objective marks alone exceed the recorded total"
            : drift > 0
              ? "rubric too generous"
              : "rubric too harsh";
      console.log(
        `${String(n).padStart(2)}  ${String(rows.length).padStart(2)}   ` +
          `${exp.toFixed(2).padStart(7)}  ${avg((r) => r.got).toFixed(2).padStart(6)}   ` +
          `${obj.toFixed(2).padStart(8)}  ${ft.toFixed(2).padStart(9)}   ${verdict}`,
      );
    }

    console.log("\n─── per-question average award (worst drift first) ───");
    const suspect = [...qStats.values()]
      .filter((s) => byHw.includes(s.hw))
      .map((s) => {
        const mean = s.awarded.reduce((a, b) => a + b, 0) / s.awarded.length;
        return { ...s, mean, share: s.points ? mean / s.points : 0 };
      })
      // A question the engine always gives full marks for, or never any, is the
      // most likely culprit — real cohorts are not that uniform.
      .filter((s) => s.share >= 0.98 || s.share <= 0.02)
      .sort((a, b) => b.points - a.points);
    for (const s of suspect) {
      console.log(
        `  HW ${String(s.hw).padStart(2)} Q${String(s.position).padStart(2)} [${s.qtype.padEnd(9)}] ` +
          `worth ${String(s.points).padStart(2)} → mean ${s.mean.toFixed(2)} ` +
          `(${(s.share * 100).toFixed(0)}% of the marks, every response)`,
      );
    }
  }

  console.log(`\n${usable.length} responses compared across ${byHw.length} homeworks`);
  console.log(`  within ±1: ${pct(within(1)).toFixed(1)}%   exact: ${pct(within(0)).toFixed(1)}%`);
  console.log(`  MAE ${mae.toFixed(2)}   bias ${bias >= 0 ? "+" : ""}${bias.toFixed(2)}`);
  console.log(`  gate ≥85% within ±1 → ${passed ? "PASS" : "FAIL"}`);
  console.log(`\nreport written to ${REPORT}`);
  if (!runAll) console.log(`(sampled ${perHwLimit} per homework — pass --all for the full set)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
