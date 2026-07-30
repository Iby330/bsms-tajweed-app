/**
 * import_forms.ts — Google Forms export → Supabase content-seed migration.
 *
 * Reads  reference/forms_export.json          (form definitions, committed)
 *        Tawjeed HW Master Guide .md          (model answers, LOCAL ONLY)
 * Emits  web/supabase/migrations/0003_content_seed.sql
 *
 * Run:   cd web && npx tsx ../execution/import_forms.ts
 *
 * Mapping rules implement brainstorm A5 exactly:
 *  - skip Name/Class metadata items, section headers, zero-point notices
 *  - single-option zero-point "task" items → is_task (voice-note slot)
 *  - GRID/CHECKBOX_GRID → scoring 'manual', needs_key, residual points
 *    (HW 9→10, 19→3, 20→4, 21→10)
 *  - checkbox with points>1 and >1 correct option → 'per_option'
 *  - graded questions beyond the official total → is_bonus (HW 15 bonus round)
 *  - TFP forms → homework numbers 101..107, series 'tfp', ungraded
 *  - HARD ASSERT: per-HW non-bonus points == gradebook divisor, else abort
 *  - rubrics for free-text from the guide's model answers (guide totals are
 *    known-wrong and never read; only its answers are used)
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ───────────────────────── constants ─────────────────────────

/** Official totals from the gradebook divisors (brainstorm A3) — the truth. */
export const GRADEBOOK_TOTALS: Record<number, number> = {
  1: 10, 2: 8, 3: 10, 4: 10, 5: 4, 6: 12, 7: 16, 8: 13, 9: 15, 10: 10,
  11: 12, 12: 9, 13: 6, 14: 13, 15: 7, 16: 9, 17: 8, 18: 12, 19: 18,
  20: 18, 21: 18,
};

/** Apps Script returns null points for grid items; residuals are unambiguous
 *  (exactly one grid per affected form — brainstorm A5). */
export const GRID_RESIDUALS: Record<number, number> = { 9: 10, 19: 3, 20: 4, 21: 10 };

/** HW number → [term, week] placement. TFP (101+) gated to Term 3. */
export function weekFor(hwNumber: number): { term: number; week: number } {
  if (hwNumber >= 101) return { term: 3, week: hwNumber - 100 };
  if (hwNumber <= 8) return { term: 1, week: hwNumber };
  if (hwNumber <= 15) return { term: 2, week: hwNumber - 8 };
  return { term: 3, week: hwNumber - 15 };
}

// ───────────────────────── types ─────────────────────────

type FormItem = {
  index: number;
  type: string;
  title: string;
  helpText?: string;
  points?: number | null;
  required?: boolean;
  options?: { position: number; label: string; value: string; correct: boolean | null }[];
  answerKeyAvailable?: boolean;
};

type Form = {
  file: string;
  title: string;
  isQuiz: boolean;
  items: FormItem[];
};

export type OutQuestion = {
  position: number;
  qtype: "mcq" | "checkbox" | "text" | "paragraph" | "grid";
  scoring: "exact" | "per_option" | "manual";
  prompt: string;
  points: number;
  is_bonus: boolean;
  is_task: boolean;
  options: { position: number; label: string; value: string; correct: boolean }[] | null;
  rubric: { id: string; desc: string; marks: number }[] | null;
  needs_key: boolean;
};

export type OutHomework = {
  number: number;
  title: string;
  series: "tajweed" | "tfp";
  total_marks: number;
  is_graded: boolean;
  questions: OutQuestion[];
};

// ───────────────────────── pure transforms ─────────────────────────

/** "1 : Introduction" → 1 · "TFP: HW 3" → 103 · unparseable → null */
export function hwNumber(fileName: string): number | null {
  const tfp = fileName.match(/TFP\s*:?\s*HW\s*(\d+)/i);
  if (tfp) return 100 + parseInt(tfp[1], 10);
  const m = fileName.match(/^\s*(\d+)\s*[:\s]/);
  return m ? parseInt(m[1], 10) : null;
}

const META_TITLES = /^(name|class|which class do you belong to)\s*\??\s*$/i;
const TASK_RE = /task|recite|record|voice note|find\s+.*examples?/i;

export function classifyItem(
  item: FormItem,
): "skip" | "task" | "question" {
  if (["SECTION_HEADER", "PAGE_BREAK", "IMAGE"].includes(item.type)) return "skip";
  if (META_TITLES.test(item.title?.trim() ?? "")) return "skip";
  const pts = typeof item.points === "number" ? item.points : null;
  const singleOption = (item.options?.length ?? 0) === 1;
  if (singleOption && (pts === 0 || pts === null)) {
    return TASK_RE.test(item.title) ? "task" : "skip"; // notices/encouragements
  }
  return "question";
}

export function mapType(t: string): OutQuestion["qtype"] {
  switch (t) {
    case "MULTIPLE_CHOICE": case "LIST": return "mcq";
    case "CHECKBOX": return "checkbox";
    case "TEXT": return "text";
    case "PARAGRAPH_TEXT": return "paragraph";
    case "GRID": case "CHECKBOX_GRID": return "grid";
    default: throw new Error(`unhandled item type: ${t}`);
  }
}

/** Transform one form. `gridPoints` injected for the 4 residual cases. */
export function transformForm(form: Form): OutHomework {
  const num = hwNumber(form.file);
  if (num == null) throw new Error(`cannot parse HW number from "${form.file}"`);
  const isTfp = num >= 101;
  const official = isTfp ? 0 : GRADEBOOK_TOTALS[num];
  if (!isTfp && official == null) throw new Error(`HW ${num} not in gradebook table`);

  const questions: OutQuestion[] = [];
  let pos = 0;
  let gradedSum = 0;

  for (const item of form.items) {
    const kind = classifyItem(item);
    if (kind === "skip") continue;
    pos += 1;

    if (kind === "task") {
      questions.push({
        position: pos, qtype: "text", scoring: "manual", prompt: item.title,
        points: 0, is_bonus: false, is_task: true, options: null, rubric: null,
        needs_key: false,
      });
      continue;
    }

    const qtype = mapType(item.type);
    const isGrid = qtype === "grid";
    let points = typeof item.points === "number" ? item.points : 0;
    if (isGrid && item.points == null) points = GRID_RESIDUALS[num] ?? 0;

    const correctOpts = (item.options ?? []).filter((o) => o.correct === true);
    const scoring: OutQuestion["scoring"] = isGrid
      ? "manual"
      : qtype === "checkbox" && points > 1 && correctOpts.length > 1
        ? "per_option"
        : "exact";

    // bonus rule: graded marks past the official total are the bonus round
    const isBonus = !isTfp && points > 0 && gradedSum + points > official;
    if (!isBonus) gradedSum += points;

    questions.push({
      position: pos,
      qtype,
      scoring,
      prompt: item.title,
      points,
      is_bonus: isBonus,
      is_task: false,
      options: item.options?.length
        ? item.options.map((o) => ({
            position: o.position, label: o.label, value: o.value,
            correct: o.correct === true,
          }))
        : null,
      rubric: null, // attached later from the guide
      needs_key: isGrid,
    });
  }

  if (!isTfp && gradedSum !== official) {
    throw new Error(
      `TOTALS MISMATCH HW ${num}: non-bonus points sum to ${gradedSum}, gradebook says ${official}`,
    );
  }

  return {
    number: num,
    title: form.title || form.file,
    series: isTfp ? "tfp" : "tajweed",
    total_marks: official,
    is_graded: !isTfp,
    questions,
  };
}

// ───────────────────────── guide rubrics ─────────────────────────

const norm = (s: string) =>
  s.toLowerCase().replace(/[*"'"'?¿:;،؟.!()\[\]\\-]/g, "").replace(/\s+/g, " ").trim();

type GuideRow = { question: string; answer: string };

/** Parse the master guide into per-HW rows of {question, answer}.
 *  Totals in the guide are known-wrong and deliberately ignored. */
export function parseGuide(md: string): Record<number, GuideRow[]> {
  const out: Record<number, GuideRow[]> = {};
  const blocks = md.split(/\n(?=\|\s*HW\s*\d+\s*:)/);
  for (const block of blocks) {
    const h = block.match(/^\|\s*HW\s*(\d+)\s*:/);
    if (!h) continue;
    const n = parseInt(h[1], 10);
    const rows: GuideRow[] = [];
    for (const line of block.split("\n")) {
      const m = line.match(/^\|\s*\\?`?\d+\s*\|\s*\*\*(.+?)\*\*\s*([^|]*)\|/);
      if (m) rows.push({ question: m[1].trim(), answer: m[2].trim() });
    }
    out[n] = rows;
  }
  return out;
}

/** "Observing each letter with correct origin (1) And characteristics (1)"
 *  → [{desc:"Observing each letter with correct origin",marks:1},
 *     {desc:"And characteristics",marks:1}] */
export function answerToConcepts(
  answer: string,
  questionPoints: number,
): { id: string; desc: string; marks: number }[] {
  const parts = [...answer.matchAll(/([\s\S]+?)\((\d+)(?:\s*marks?)?\)/g)].map((m, i) => ({
    id: `c${i + 1}`,
    desc: m[1].replace(/\s+/g, " ").trim(),
    marks: parseInt(m[2], 10),
  }));
  const sum = parts.reduce((s, p) => s + p.marks, 0);
  if (parts.length > 0 && sum === questionPoints) return parts;
  // marker sum disagrees with the form's points → form wins, single concept
  return [{ id: "c1", desc: answer.replace(/\s+/g, " ").trim(), marks: questionPoints }];
}

/** Attach guide rubrics to free-text questions by fuzzy question-text match. */
export function attachRubrics(
  hw: OutHomework,
  guideRows: GuideRow[] | undefined,
): number {
  if (!guideRows?.length) return 0;
  let attached = 0;
  for (const q of hw.questions) {
    if (!["text", "paragraph"].includes(q.qtype) || q.is_task || q.points <= 0) continue;
    const nq = norm(q.prompt);
    const row = guideRows.find((r) => {
      const ng = norm(r.question);
      const probe = ng.slice(0, 20);
      return probe.length >= 10 && nq.includes(probe);
    });
    if (row && row.answer) {
      q.rubric = answerToConcepts(row.answer, q.points);
      attached += 1;
    }
  }
  return attached;
}

// ───────────────────────── SQL emission ─────────────────────────

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const qj = (v: unknown) => (v == null ? "null" : `${q(JSON.stringify(v))}::jsonb`);

export function emitSql(homeworks: OutHomework[]): string {
  const lines: string[] = [
    "-- ═══ GENERATED by execution/import_forms.ts — do not hand-edit ═══",
    "-- Source: reference/forms_export.json (+ master guide model answers)",
    "",
  ];
  for (const hw of homeworks) {
    const { term, week } = weekFor(hw.number);
    lines.push(
      `insert into homeworks (id, week_id, number, title, series, total_marks, is_graded, due_at)`,
      `select gen_random_uuid(), w.id, ${hw.number}, ${q(hw.title)}, ${q(hw.series)}, ${hw.total_marks}, ${hw.is_graded}, w.unlock_at + interval '6 days 18 hours'`,
      `from weeks w where w.term_id = ${term} and w.number = ${week};`,
      "",
    );
    // matching tajweed lesson stub for the same week (video ids backfilled later)
    if (hw.series === "tajweed") {
      lines.push(
        `insert into lessons (week_id, series, title, position)`,
        `select w.id, 'tajweed', ${q(`Tajweed ${hw.number} — ${hw.title.replace(/^\d+\s*:\s*/, "")}`)}, 1`,
        `from weeks w where w.term_id = ${term} and w.number = ${week};`,
        "",
      );
    } else {
      lines.push(
        `insert into lessons (week_id, series, title, position)`,
        `select w.id, 'tfp', ${q(hw.title)}, 3`,
        `from weeks w where w.term_id = ${term} and w.number = ${week};`,
        "",
      );
    }
    for (const qn of hw.questions) {
      lines.push(
        `insert into questions (homework_id, position, qtype, scoring, prompt, points, is_bonus, is_task, options, rubric, needs_key)`,
        `select h.id, ${qn.position}, ${q(qn.qtype)}, ${q(qn.scoring)}, ${q(qn.prompt)}, ${qn.points}, ${qn.is_bonus}, ${qn.is_task}, ${qj(qn.options)}, ${qj(qn.rubric)}, ${qn.needs_key}`,
        `from homeworks h where h.number = ${hw.number};`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

// ───────────────────────── main ─────────────────────────

export function run(repoRoot: string): { homeworks: OutHomework[]; sql: string; rubrics: number } {
  const exportPath = join(repoRoot, "reference/forms_export.json");
  const guidePath = join(repoRoot, "Tawjeed HW Master Guide .md");

  const data = JSON.parse(readFileSync(exportPath, "utf8"));
  const guide = existsSync(guidePath)
    ? parseGuide(readFileSync(guidePath, "utf8"))
    : {};

  const homeworks = (data.forms as Form[])
    .map(transformForm)
    .sort((a, b) => a.number - b.number);

  // duplicate HW numbers would violate the unique constraint — fail loudly
  const seen = new Set<number>();
  for (const hw of homeworks) {
    if (seen.has(hw.number)) throw new Error(`duplicate homework number ${hw.number}`);
    seen.add(hw.number);
  }

  let rubrics = 0;
  for (const hw of homeworks) rubrics += attachRubrics(hw, guide[hw.number]);

  return { homeworks, sql: emitSql(homeworks), rubrics };
}

// path may contain spaces: compare decoded paths, never raw URLs
const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(here, "..");
  const { homeworks, sql, rubrics } = run(repoRoot);
  const out = join(repoRoot, "web/supabase/migrations/0003_content_seed.sql");
  writeFileSync(out, sql);
  const graded = homeworks.reduce(
    (s, h) => s + h.questions.filter((x) => x.points > 0).length, 0);
  console.log(
    `wrote ${out}\n${homeworks.length} homeworks · ${graded} graded questions · ${rubrics} rubrics attached`,
  );
}
