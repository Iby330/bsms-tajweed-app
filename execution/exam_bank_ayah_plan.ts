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
 *     Safe pictures and the owner's decided ones (OWNER_DECISIONS) are planned.
 *     Picture paths are kept, except the two slide titles that are not the
 *     Qur'an, whose prompt_images are emptied; ayah-proposals.json keeps every
 *     original path either way, so the picture stays viewable.
 *   - web/src/lib/exam-builder/ayah-proposals.json: per row and slot, the ref
 *     the owner's comparison page puts back after "Keep the picture", and why
 *     a slot needs a look. Safe and owner_check slots; owner_check is offered,
 *     never planned.
 *   - <mapping dir>/change-plan-ayahs-papers.json + revert-plan-ayahs-papers.json:
 *     the same changes for the papers' copies (exam_paper_items), only where a
 *     copy's picture is still the bank's; edited copies are skipped and listed.
 * Prints the counts of both plans.
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
import {
  buildAyahPlan, buildProposals, endKeysNeeded,
  type CurrentRow, type EndPositions, type MappingLine, type OwnerDecisions, type Proposals,
} from "../web/src/lib/exam-builder/ayah-plan";

const PROJECT_REF = "ssqeakiutclbiwizrchh";

/**
 * The owner's calls on the 7 pictures the mapping could not clear (2026-11-24),
 * by picture. With these every one of the 224 pictures is planned.
 * Circles: centre `x` and width `w` as fractions of the word from its right
 * edge, tuned against the source pictures (headless screenshots of the
 * typeset word beside the picture).
 */
const OWNER_DECISIONS: OwnerDecisions = {
  // Counting questions over a page crop that shows the basmala: typeset the surah WITH it.
  "bank/a8a0b10989431542ba98e6c88b801ea50afc8de7.png": { safe: true, basmala: true, why: "typeset Al-Kafirun with the basmala above it, as the picture had it, so the madd count still works." },
  "bank/3c0b9689c2ef12361ffbd9a76614d8a991f9984c.jpg": { safe: true, basmala: true, why: "typeset At-Tin with the basmala above it, as the picture had it, so the madd count still works." },
  // An iqlaab question, not a waqf one: the stop sign the typeset words carry does not change it.
  "bank/00384cd4dea7a9eaaa1572480ecc9e7be81087bb.png": { safe: true, why: "typeset from 54:6 like the others. The question is about iqlaab, not stopping, so the stop sign in the typeset words does not matter." },
  // Hand-drawn circles round one letter, drawn again over the typeset word.
  "bank/b096e76e8b4f7f13aded7751ecfa470016871474.png": { safe: true, circle: { word: 1, x: 0.3, w: 0.2 }, why: "circle the ر of ٱلرَّحْمَـٰنِ again, over the typeset word." },
  "bank/6ad241c0a65d3ba6901f895a1a89f8a0b2a87aad.png": { safe: true, circle: { word: 1, x: 0.18, w: 0.2 }, why: "circle the س of بِسْمِ (the answer is the whistling letter). The picture's circle sat on the join of ب and س." },
  // Slide titles, not the Qur'an: type the term into the question instead.
  "bank/b82e3af9e1fe570327597bfe7d1b37d4c1f1415e.png": { term: "ياء النداء", why: "the question already names ياء النداء, so the picture just stops showing." },
  "bank/751434c7b8440c1f289add6561d525dcdd5c4380.png": {
    term: "هاء التنبيه", prompt: "What does هاء التنبيه mean?", promptWas: "What does mean?",
    why: "the question read \"What does mean?\": the term هاء التنبيه is typed into it (the answer is \"The haa of alerting\").",
  },
};
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

  const { proposals, skipped: notProposed } = buildProposals(lines, ends, OWNER_DECISIONS);
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

  // Paper copies: the same changes, only where a copy's picture is still the bank's.
  const itemRows = await select(
    token,
    `select i.id, i.bank_question_id, i.prompt, i.prompt_images, i.prompt_quran, i.options,
            p.status as paper_status, coalesce(nullif(p.name, ''), p.title) as paper_label, p.id as paper_id
       from exam_paper_items i join exam_papers p on p.id = i.paper_id
      where i.bank_question_id in (${uuids(ids)})
      order by p.id, i.position, i.id`,
  );
  const items: CurrentRow[] = itemRows.map((r) => ({
    id: String(r.id), bank_question_id: String(r.bank_question_id), prompt: String(r.prompt ?? ""), archived: false,
    label: `${r.paper_label} [${r.paper_status}, ${String(r.paper_id).slice(0, 8)}]`,
    prompt_images: r.prompt_images as string[] | null, prompt_quran: r.prompt_quran, options: r.options,
  }));
  const papers = buildAyahPlan(proposals, items, today, "mapping.jsonl + live exam_paper_items", "exam_paper_items", "change-plan-ayahs-papers.json");
  writeFileSync(join(outDir, "change-plan-ayahs-papers.json"), JSON.stringify(papers.plan, null, 1));
  writeFileSync(join(outDir, "revert-plan-ayahs-papers.json"), JSON.stringify(papers.revert, null, 1));

  const slots = (p: Proposals, status: string) =>
    Object.values(p).reduce((n, r) => n + (r.prompt?.status === status ? 1 : 0) + Object.values(r.options ?? {}).filter((o) => o.status === status).length, 0);
  console.log(`mapping: ${lines.length} pictures; proposals: ${ids.length} rows, ${slots(proposals, "safe")} safe slots, ${slots(proposals, "owner_check")} owner-check slots, ${slots(proposals, "emphasis")} circled-letter slots`);
  console.log(`not proposed (${notProposed.length}):`);
  for (const s of notProposed) console.log(`  ${s.row_id.slice(0, 8)} ${s.slot}: ${s.reason}`);
  console.log(`rows read: ${rows.length} of ${ids.length}`);
  console.log(
    `plan: ${plan.entries.length} entries, ${plan.entries.reduce((n, e) => n + e.ops.length, 0)} ops ` +
      `(${stats.promptSet} prompts newly set, ${stats.promptReplaced} prompt refs replaced, ${stats.optionSlots} option slots, ` +
      `${stats.archivedRows} archived rows, ${stats.terms} slide titles typed as terms, ${stats.alreadySet} slots already set, ${stats.keptPictures} existing refs cleared to keep a picture, ` +
      `${stats.movedOptions} options found at a new place)`,
  );
  for (const e of plan.entries) {
    for (const o of e.ops) if (o.field === "prompt_quran" && o.old) console.log(`  ${e.entry_id} ${o.row_id.slice(0, 8)}: ${o.reason}`);
    for (const o of e.ops) if (o.field === "options" && /keep the picture/.test(o.reason)) console.log(`  ${e.entry_id} ${o.row_id.slice(0, 8)}: ${o.reason}`);
  }
  console.log(`skipped while planning (${skipped.length}):`);
  for (const s of skipped) console.log(`  ${s.row_id.slice(0, 8)} ${s.slot}: ${s.reason}`);
  console.log(
    `paper copies: ${items.length} items copied from mapped rows, in ${new Set(items.map((i) => i.label)).size} papers; ` +
      `plan ${papers.plan.entries.length} entries, ${papers.plan.entries.reduce((n, e) => n + e.ops.length, 0)} ops ` +
      `(${papers.stats.promptSet} prompts newly set, ${papers.stats.promptReplaced} prompt refs replaced, ${papers.stats.optionSlots} option slots, ` +
      `${papers.stats.terms} terms, ${papers.stats.alreadySet} slots already set)`,
  );
  for (const e of papers.plan.entries) for (const o of e.ops) if (o.field === "prompt_quran" && o.old) console.log(`  ${e.entry_id} ${e.question}: ${o.reason}`);
  console.log(`  skipped, the copy edited (${papers.skipped.length}):`);
  for (const s of papers.skipped) console.log(`    item ${s.row_id.slice(0, 8)} ${s.slot}: ${s.reason}`);
  for (const f of ["change-plan-ayahs.json", "revert-plan-ayahs.json", "change-plan-ayahs-papers.json", "revert-plan-ayahs-papers.json"]) console.log(`wrote ${join(outDir, f)}`);
  console.log(`wrote ${proposalsPath}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
