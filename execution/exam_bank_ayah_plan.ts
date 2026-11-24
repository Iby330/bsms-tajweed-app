/**
 * exam_bank_ayah_plan.ts — build the change plan that gives the exam bank's
 * Qur'an pictures their typeset refs. READ-ONLY against the database: it
 * reads rows and writes files, nothing else.
 *
 *   npx tsx execution/exam_bank_ayah_plan.ts [--mapping <mapping.jsonl>] [--env <path to .env>]
 *
 * (If `npx tsx` is not found, call web/node_modules/.bin/tsx directly.)
 *
 * Reads
 *   - mapping.jsonl (default: brainstorms/exam-ayah-typeset-2026-11-24/), one
 *     line per bank picture with its verified ref and a `swap` verdict.
 *   - the live exam_bank_questions rows the mapping names (archived included),
 *     the end-marker positions of the ayahs a word range ends on, and the
 *     exam_paper_items copied from those rows.
 * Writes
 *   - <mapping dir>/change-plan-ayahs.json + revert-plan-ayahs.json, in the
 *     format execution/exam_bank_apply_audit.ts applies (dry run by default).
 *     Only `swap: "safe"` pictures are planned. Pictures are never touched.
 *   - web/src/lib/exam-builder/ayah-proposals.json: per row and slot, the ref
 *     the owner's comparison page puts back after "Keep the picture", and why
 *     a slot needs a look. Safe and owner_check slots; owner_check is offered,
 *     never planned.
 * Prints the plan's counts and how many paper items (copies) still show a
 * picture where the bank will have a ref.
 *
 * The pure logic is web/src/lib/exam-builder/ayah-plan.ts (tested there).
 *
 * Credentials: SUPABASE_ACCESS_TOKEN (Management API), from --env, else
 * <repo>/.env, else the main checkout's .env. Never printed.
 *
 * Gotchas
 *   - tsx compiles files outside web/ as CJS: no top-level await; all in main().
 *   - The mapping's `to_word` names the last real word; when the picture shows
 *     the ayah's end marker, the ref is extended to the marker's position so the
 *     typeset words carry the same rosette.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execSync } from "node:child_process";
import { parseQuranRef } from "../web/src/lib/exam-builder/parse";
import {
  buildAyahPlan, buildProposals, endKeysNeeded, refText,
  type CurrentRow, type EndPositions, type MappingLine, type Proposals,
} from "../web/src/lib/exam-builder/ayah-plan";

const PROJECT_REF = "ssqeakiutclbiwizrchh";
const here = dirname(resolve(process.argv[1] ?? "execution/exam_bank_ayah_plan.ts"));
const repoRoot = join(here, "..");

type Row = Record<string, unknown>;

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function readEnvFile(path: string): Record<string, string> {
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        const raw = l.slice(i + 1).trim();
        const quoted = /^(["'])(.*)\1$/.exec(raw);
        return [l.slice(0, i).trim(), quoted ? quoted[2] : raw.split(/\s+#/)[0].trim()];
      }),
  );
}

function mainCheckout(): string | null {
  try {
    const common = execSync("git rev-parse --path-format=absolute --git-common-dir", { cwd: repoRoot }).toString().trim();
    return dirname(common);
  } catch {
    return null;
  }
}

function findToken(envPath?: string): string {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;
  const main = mainCheckout();
  const candidates = envPath ? [resolve(envPath)] : [join(repoRoot, ".env"), ...(main ? [join(main, ".env")] : [])];
  for (const p of candidates) {
    if (existsSync(p)) {
      const t = readEnvFile(p).SUPABASE_ACCESS_TOKEN;
      if (t) return t;
    }
  }
  console.error(`SUPABASE_ACCESS_TOKEN not found in ${candidates.join(" or ")}. Pass --env <path to .env>.`);
  process.exit(2);
}

/** SELECTs only: this script never writes to the database. */
async function select(token: string, query: string): Promise<Row[]> {
  if (!/^\s*select\b/i.test(query)) throw new Error("read-only: only SELECT is allowed here");
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const body = await res.text();
  if (res.status === 401) throw new Error("SQL failed (401): SUPABASE_ACCESS_TOKEN has expired. Get a new one at https://supabase.com/dashboard/account/tokens.");
  if (!res.ok) throw new Error(`SQL failed (${res.status}): ${body}`);
  return JSON.parse(body) as Row[];
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const uuids = (ids: string[]) => ids.map((id) => `${q(id)}::uuid`).join(", ");

/**
 * Paper copies (exam_paper_items) of mapped rows, by what happens to them
 * once the new code is live. The plan never touches them.
 *  - keeps: a picture where the bank will have a ref; the copy has none, so
 *    it keeps showing the picture.
 *  - switches: the copy already carries a ref beside its picture, so it turns
 *    typeset as soon as the code is live; `differs` when that ref is not the
 *    one the bank will hold (too wide, or a slot the owner must decide on).
 */
function paperItemsAffected(items: Row[], proposals: Proposals) {
  const out: { paper: string; status: string; item: string; keeps: string[]; switches: string[] }[] = [];
  const same = (a: unknown, b: unknown) => JSON.stringify(parseQuranRef(a)) === JSON.stringify(parseQuranRef(b));
  for (const it of items) {
    const p = proposals[String(it.bank_question_id)];
    if (!p) continue;
    const keeps: string[] = [];
    const switches: string[] = [];
    const images = (Array.isArray(it.prompt_images) ? it.prompt_images : []).filter(Boolean) as string[];
    if (p.prompt && images.length > 0) {
      if (!it.prompt_quran) {
        if (p.prompt.status === "safe") keeps.push("prompt");
      } else {
        const ok = p.prompt.status === "safe" && same(it.prompt_quran, p.prompt.ref);
        switches.push(ok ? "prompt" : `prompt (DIFFERS: copy has ${JSON.stringify(it.prompt_quran)}, bank: ${p.prompt.status} ${refText(p.prompt.ref)})`);
      }
    }
    const opts = Array.isArray(it.options) ? (it.options as Row[]) : [];
    opts.forEach((o, i) => {
      const want = p.options?.[String(o.image)];
      if (!want) return;
      if (!o.quran) { if (want.status === "safe") keeps.push(`option ${i + 1}`); }
      else switches.push(want.status === "safe" && same(o.quran, want.ref) ? `option ${i + 1}` : `option ${i + 1} (DIFFERS)`);
    });
    if (keeps.length || switches.length) {
      out.push({ paper: `${it.paper_name || it.paper_title} (${String(it.paper_id).slice(0, 8)})`.trim(), status: String(it.paper_status), item: String(it.id), keeps, switches });
    }
  }
  return out;
}

async function main() {
  const mappingPath = resolve(
    arg("--mapping") ?? join(mainCheckout() ?? repoRoot, "brainstorms/exam-ayah-typeset-2026-11-24/mapping.jsonl"),
  );
  const outDir = dirname(mappingPath);
  const lines: MappingLine[] = readFileSync(mappingPath, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  const token = findToken(arg("--env"));

  // End markers of the ayahs a word range ends on (when the picture shows the marker).
  const ends: EndPositions = {};
  const keys = endKeysNeeded(lines);
  if (keys.length) {
    const pairs = keys.map((k) => `(${k.split(":").map(Number).join(", ")})`).join(", ");
    for (const r of await select(token, `select surah_number, ayah_number, word_position from quran_words where is_end and (surah_number, ayah_number) in (${pairs})`)) {
      ends[`${r.surah_number}:${r.ayah_number}`] = Number(r.word_position);
    }
  }

  const { proposals, skipped: notProposed } = buildProposals(lines, ends);
  const ids = Object.keys(proposals);
  const rows: CurrentRow[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    for (const r of await select(token, `select id, prompt, archived, prompt_images, prompt_quran, options from exam_bank_questions where id in (${uuids(chunk)})`)) {
      rows.push(r as unknown as CurrentRow);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const { plan, revert, skipped, stats } = buildAyahPlan(proposals, rows, today);
  plan.skipped = [...notProposed, ...skipped];
  writeFileSync(join(outDir, "change-plan-ayahs.json"), JSON.stringify(plan, null, 1));
  writeFileSync(join(outDir, "revert-plan-ayahs.json"), JSON.stringify(revert, null, 1));

  const proposalsPath = join(repoRoot, "web/src/lib/exam-builder/ayah-proposals.json");
  writeFileSync(proposalsPath, `${JSON.stringify(proposals, null, 1)}\n`);

  const items = await select(
    token,
    `select i.id, i.paper_id, i.bank_question_id, i.prompt_images, i.prompt_quran, i.options,
            p.status as paper_status, p.name as paper_name, p.title as paper_title
       from exam_paper_items i join exam_papers p on p.id = i.paper_id
      where i.bank_question_id in (${uuids(ids)})`,
  );
  const affected = paperItemsAffected(items, proposals);

  const slots = (p: Proposals, status: string) =>
    Object.values(p).reduce((n, r) => n + (r.prompt?.status === status ? 1 : 0) + Object.values(r.options ?? {}).filter((o) => o.status === status).length, 0);
  console.log(`mapping: ${lines.length} pictures; proposals: ${ids.length} rows, ${slots(proposals, "safe")} safe slots, ${slots(proposals, "owner_check")} owner-check slots, ${slots(proposals, "emphasis")} circled-letter slots`);
  console.log(`not proposed (${notProposed.length}):`);
  for (const s of notProposed) console.log(`  ${s.row_id.slice(0, 8)} ${s.slot}: ${s.reason}`);
  console.log(`rows read: ${rows.length} of ${ids.length}`);
  console.log(
    `plan: ${plan.entries.length} entries, ${plan.entries.reduce((n, e) => n + e.ops.length, 0)} ops ` +
      `(${stats.promptSet} prompts newly set, ${stats.promptReplaced} prompt refs replaced, ${stats.optionSlots} option slots, ` +
      `${stats.archivedRows} archived rows, ${stats.alreadySet} slots already set, ${stats.keptPictures} existing refs cleared to keep a picture, ` +
      `${stats.movedOptions} options found at a new place)`,
  );
  for (const e of plan.entries) {
    for (const o of e.ops) if (o.field === "prompt_quran" && o.old) console.log(`  ${e.entry_id} ${o.row_id.slice(0, 8)}: ${o.reason}`);
    for (const o of e.ops) if (o.field === "options" && /keep the picture/.test(o.reason)) console.log(`  ${e.entry_id} ${o.row_id.slice(0, 8)}: ${o.reason}`);
  }
  console.log(`skipped while planning (${skipped.length}):`);
  for (const s of skipped) console.log(`  ${s.row_id.slice(0, 8)} ${s.slot}: ${s.reason}`);
  const keeps = affected.filter((a) => a.keeps.length);
  const switches = affected.filter((a) => a.switches.length);
  console.log(`paper items (copies) of mapped rows: ${affected.length} in ${new Set(affected.map((a) => a.paper)).size} papers`);
  console.log(`  ${keeps.length} keep a picture where the bank will have a ref (the plan does not touch copies):`);
  for (const a of keeps) console.log(`    [${a.status}] ${a.paper} item ${a.item.slice(0, 8)}: ${a.keeps.join(", ")}`);
  console.log(`  ${switches.length} already carry a ref beside the picture, so turn typeset once the code is live:`);
  for (const a of switches) console.log(`    [${a.status}] ${a.paper} item ${a.item.slice(0, 8)}: ${a.switches.join(", ")}`);
  console.log(`wrote ${join(outDir, "change-plan-ayahs.json")}\n      ${join(outDir, "revert-plan-ayahs.json")}\n      ${proposalsPath}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
