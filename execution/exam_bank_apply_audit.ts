/**
 * exam_bank_apply_audit.ts — apply (or undo) a reviewed change plan to the live
 * exam question bank, one compare-and-set per entry.
 *
 *   npx tsx execution/exam_bank_apply_audit.ts <plan.json>                 # dry run (default)
 *   npx tsx execution/exam_bank_apply_audit.ts <plan.json> --apply         # write
 *   npx tsx execution/exam_bank_apply_audit.ts <plan.json> --only C003,C038 [--apply]
 *   npx tsx execution/exam_bank_apply_audit.ts <plan.json> --env <path to .env>
 *
 * If `npx tsx` is not found, call web/node_modules/.bin/tsx directly.
 *
 * The plan (change-plan.json, or the matching revert-plan.json, which is the same
 * shape with old/new swapped and the entries reversed):
 *   { kind: "forward" | "revert", entries: [ { entry_id, bucket, question,
 *       ops: [ { entry_id, row_id, field, old, new, reason } ] } ], skipped: [...] }
 * Only `exam_bank_questions` is written, and only the fields in FIELDS below.
 * It never inserts or deletes a row and never touches exam_paper_items.
 *
 * Safety
 *   - Dry run unless --apply. A dry run reads the live rows and prints, per entry,
 *     what would change and whether it can.
 *   - Per entry, every op's field must currently equal the plan's `old` (pending),
 *     or every op's field must equal `new` (already applied: skipped). Anything
 *     else (a teacher or admin edited the row, a paper's "mark as final" stamped
 *     used_in, …) is a conflict: the entry is skipped and reported, never forced.
 *   - The write is ONE SQL statement per entry: the rows are locked FOR UPDATE,
 *     the old values re-checked under the lock, and either every op in the entry
 *     lands or none does. Safe to re-run: applied entries report "already".
 *   - Every --apply run appends to <plan>.applied-log.json beside the plan
 *     (dry runs are logged too, marked as such).
 *
 * Credentials: SUPABASE_ACCESS_TOKEN (Management API query endpoint, same as
 * execution/apply_migration.ts), read from --env, else <repo>/.env, else the main
 * checkout's .env (a worktree has none of its own). Never printed.
 *
 * Gotchas
 *   - tsx compiles files outside web/ as CJS: no top-level await; all in main().
 *   - The Management API returns numeric columns as strings ("1.0"); marks are
 *     compared as numbers. jsonb keys come back reordered; comparisons use a
 *     key-sorted canonical form here and jsonb equality in SQL.
 *   - SUPABASE_ACCESS_TOKEN can expire mid-session (401). A run cut short is
 *     safe: finished entries are complete, the rest are untouched; re-run.
 *   - Re-running execution/exam_bank_import.ts over the same bank.json would put
 *     back the content and sources this plan changes on non-approved rows (it
 *     overwrites them from bank.json; it never sends `archived`, so retired rows
 *     stay archived, and used_in is unioned). Rebuild bank.json first.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { execSync } from "node:child_process";

const PROJECT_REF = "ssqeakiutclbiwizrchh";
const TABLE = "exam_bank_questions";

type FieldType = "text" | "jsonb" | "textarr" | "bool" | "numeric";
const FIELDS: Record<string, FieldType> = {
  prompt: "text",
  options: "jsonb",
  select_many: "bool",
  answer: "text",
  marks: "numeric",
  sources: "jsonb",
  used_in: "textarr",
  archived: "bool",
  review_note: "text",
};

type Op = { entry_id: string; row_id: string; field: string; old: unknown; new: unknown; reason: string };
type Entry = { entry_id: string; bucket: string; question: string; ops: Op[] };
type Plan = { kind: "forward" | "revert"; entries: Entry[] };
type Row = Record<string, unknown> & { id: string };
type Result = { entry_id: string; question: string; status: "applied" | "would-apply" | "already" | "conflict" | "error"; detail?: string[] };

// ── args & env ────────────────────────────────────────────────────────────

const here = dirname(resolve(process.argv[1] ?? "execution/exam_bank_apply_audit.ts"));
const repoRoot = join(here, "..");

function parseArgs() {
  const argv = process.argv.slice(2);
  const valueOf = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const takesValue = new Set(["--env", "--only"]);
  const positional = argv.filter((a, i) => !a.startsWith("--") && !takesValue.has(argv[i - 1]));
  const unknown = argv.filter((a) => a.startsWith("--") && !["--apply", "--dry-run", "--env", "--only"].includes(a));
  if (positional.length !== 1 || unknown.length || (argv.includes("--apply") && argv.includes("--dry-run"))) {
    console.error("usage: npx tsx execution/exam_bank_apply_audit.ts <plan.json> [--apply] [--only C001,C002] [--env <path>]");
    process.exit(2);
  }
  const only = valueOf("--only");
  return {
    planPath: resolve(positional[0]),
    apply: argv.includes("--apply"),
    only: only ? new Set(only.split(",").map((s) => s.trim()).filter(Boolean)) : null,
    envPath: valueOf("--env"),
  };
}

/** dotenv rules as in apply_migration.ts: quoted value whole, unquoted ends at " #". */
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

function findToken(envPath?: string): string {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;
  const candidates = envPath ? [resolve(envPath)] : [join(repoRoot, ".env")];
  if (!envPath) {
    try {
      // A worktree has no .env of its own: fall back to the main checkout's.
      const common = execSync("git rev-parse --path-format=absolute --git-common-dir", { cwd: repoRoot }).toString().trim();
      candidates.push(join(dirname(common), ".env"));
    } catch {
      /* not a git checkout: only the first candidate */
    }
  }
  for (const p of candidates) {
    if (existsSync(p)) {
      const t = readEnvFile(p).SUPABASE_ACCESS_TOKEN;
      if (t) return t;
    }
  }
  console.error(`SUPABASE_ACCESS_TOKEN not found in ${candidates.join(" or ")}. Pass --env <path to .env>.`);
  process.exit(2);
}

async function runSql(token: string, query: string): Promise<Row[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const body = await res.text();
  if (res.status === 401) {
    throw new Error(
      `SQL failed (401): ${body}\nSUPABASE_ACCESS_TOKEN has expired or is malformed (not a SQL problem). ` +
        "Get a new one at https://supabase.com/dashboard/account/tokens. Entries already applied are complete; re-run to finish.",
    );
  }
  if (!res.ok) throw new Error(`SQL failed (${res.status}): ${body}`);
  return JSON.parse(body) as Row[];
}

// ── values ────────────────────────────────────────────────────────────────

function canon(v: unknown): string {
  if (v === undefined || v === null) return "null";
  if (typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canon(o[k])}`)
    .join(",")}}`;
}

function same(field: string, a: unknown, b: unknown): boolean {
  if (FIELDS[field] === "numeric") {
    const n = (x: unknown) => (x === null || x === undefined || x === "" ? null : Number(x));
    return n(a) === n(b);
  }
  return canon(a) === canon(b);
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** A SQL literal of the column's type. Strings are quoted, never interpolated raw. */
function lit(field: string, v: unknown): string {
  const t = FIELDS[field];
  if (v === null || v === undefined) {
    return t === "jsonb" ? "null::jsonb" : t === "textarr" ? "null::text[]" : t === "bool" ? "null::boolean" : t === "numeric" ? "null::numeric" : "null::text";
  }
  switch (t) {
    case "text":
      if (typeof v !== "string") throw new Error(`${field}: expected text, got ${typeof v}`);
      return `${q(v)}::text`;
    case "jsonb":
      return `${q(JSON.stringify(v))}::jsonb`;
    case "textarr":
      if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) throw new Error(`${field}: expected text[]`);
      return v.length ? `array[${v.map((x) => q(x as string)).join(",")}]::text[]` : `'{}'::text[]`;
    case "bool":
      if (typeof v !== "boolean") throw new Error(`${field}: expected boolean`);
      return v ? "true" : "false";
    case "numeric":
      if (!Number.isFinite(Number(v))) throw new Error(`${field}: expected a number`);
      return `${Number(v)}::numeric`;
  }
}

const short = (v: unknown, n = 110) => {
  const s = typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v ?? null);
  return s.length > n ? `${s.slice(0, n)}…` : s;
};

// ── plan checks ───────────────────────────────────────────────────────────

function checkPlan(plan: Plan): string[] {
  const problems: string[] = [];
  if (plan.kind !== "forward" && plan.kind !== "revert") problems.push(`plan.kind must be forward or revert, is ${plan.kind}`);
  const seen = new Set<string>();
  for (const e of plan.entries ?? []) {
    if (!e.entry_id || !Array.isArray(e.ops) || !e.ops.length) problems.push(`entry ${e.entry_id ?? "?"} has no ops`);
    const inEntry = new Set<string>();
    for (const o of e.ops ?? []) {
      if (!(o.field in FIELDS)) problems.push(`${e.entry_id}: field ${o.field} is not one this script may write`);
      if (!/^[0-9a-f-]{36}$/.test(o.row_id)) problems.push(`${e.entry_id}: bad row id ${o.row_id}`);
      if (same(o.field, o.old, o.new)) problems.push(`${e.entry_id}: ${o.row_id.slice(0, 8)}.${o.field} old equals new`);
      const k = `${o.row_id}.${o.field}`;
      if (inEntry.has(k)) problems.push(`${e.entry_id}: ${k} appears twice in one entry`);
      inEntry.add(k);
      if (seen.has(k)) problems.push(`${e.entry_id}: ${k} is also changed by an earlier entry (chained ops are not supported)`);
    }
    for (const k of inEntry) seen.add(k);
  }
  return problems;
}

/** One statement: lock the rows, re-check every old value, write all or nothing. */
function casSql(entry: Entry): string {
  const ids = [...new Set(entry.ops.map((o) => o.row_id))];
  const cols = ["id", ...new Set(entry.ops.map((o) => o.field))];
  const perRow = ids.map((id) => ({ id, ops: entry.ops.filter((o) => o.row_id === id) }));
  const updates = perRow.map(
    (r, i) =>
      `u${i} as (update ${TABLE} t set ${r.ops.map((o) => `${o.field} = ${lit(o.field, o.new)}`).join(", ")}
        from ok where ok.ok and t.id = ${q(r.id)}::uuid
          and ${r.ops.map((o) => `t.${o.field} is not distinct from ${lit(o.field, o.old)}`).join(" and ")}
        returning t.id)`,
  );
  return `with cur as (select ${cols.join(", ")} from ${TABLE} where id in (${ids.map((i) => `${q(i)}::uuid`).join(", ")}) for update),
ok as (select (select count(*) from cur) = ${ids.length}
          and ${entry.ops.map((o) => `exists (select 1 from cur c where c.id = ${q(o.row_id)}::uuid and c.${o.field} is not distinct from ${lit(o.field, o.old)})`).join("\n          and ")}
        as ok),
${updates.join(",\n")}
select (select ok from ok) as ok, ${perRow.map((_, i) => `(select count(*) from u${i})`).join(" + ")} as updated`;
}

// ── main ─────────────────────────────────────────────────────────────────

async function main() {
  const { planPath, apply, only, envPath } = parseArgs();
  const plan: Plan = JSON.parse(readFileSync(planPath, "utf8"));
  const problems = checkPlan(plan);
  if (problems.length) {
    console.error(`plan failed ${problems.length} check(s); nothing read or written:\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  const entries = plan.entries.filter((e) => !only || only.has(e.entry_id));
  if (only) for (const id of only) if (!plan.entries.some((e) => e.entry_id === id)) console.warn(`--only ${id}: not in the plan`);
  const token = findToken(envPath);
  const tag = apply ? "" : "[dry-run] ";
  console.log(`${tag}${basename(planPath)} (${plan.kind}): ${entries.length} entries, ${entries.reduce((s, e) => s + e.ops.length, 0)} ops`);

  // Read every row the plan touches, with every field it touches.
  const ids = [...new Set(entries.flatMap((e) => e.ops.map((o) => o.row_id)))];
  const live = new Map<string, Row>();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const rows = await runSql(token, `select id, ${Object.keys(FIELDS).join(", ")} from ${TABLE} where id in (${chunk.map((x) => `${q(x)}::uuid`).join(", ")})`);
    for (const r of rows) live.set(r.id, r);
  }

  const results: Result[] = [];
  for (const e of entries) {
    const state = e.ops.map((o) => {
      const row = live.get(o.row_id);
      if (!row) return { o, s: "missing" as const, cur: undefined };
      const cur = row[o.field];
      return { o, s: same(o.field, cur, o.old) ? ("old" as const) : same(o.field, cur, o.new) ? ("new" as const) : ("other" as const), cur };
    });
    const head = `${e.entry_id} ${e.bucket} — ${e.question}`;
    if (state.every((x) => x.s === "new")) {
      results.push({ entry_id: e.entry_id, question: e.question, status: "already" });
      console.log(`= ${head}: already applied`);
      continue;
    }
    if (!state.every((x) => x.s === "old")) {
      const detail = state.map((x) => `${x.o.row_id.slice(0, 8)}.${x.o.field}: ${x.s === "missing" ? "ROW MISSING" : x.s === "other" ? `changed since the plan (now ${short(x.cur, 80)})` : x.s === "new" ? "already new" : "as planned"}`);
      results.push({ entry_id: e.entry_id, question: e.question, status: "conflict", detail });
      console.log(`! ${head}: CONFLICT, skipped\n    ${detail.join("\n    ")}`);
      continue;
    }
    console.log(`${apply ? "+" : "~"} ${head}`);
    for (const { o } of state) console.log(`    ${o.row_id.slice(0, 8)}.${o.field}: ${short(o.old)}\n      -> ${short(o.new)}`);
    if (!apply) {
      results.push({ entry_id: e.entry_id, question: e.question, status: "would-apply" });
      continue;
    }
    try {
      const [res] = await runSql(token, casSql(e));
      const nRows = new Set(e.ops.map((o) => o.row_id)).size;
      if (res?.ok === true && Number(res.updated) === nRows) {
        for (const o of e.ops) live.get(o.row_id)![o.field] = o.new;
        results.push({ entry_id: e.entry_id, question: e.question, status: "applied" });
        console.log(`    applied (${nRows} row${nRows > 1 ? "s" : ""})`);
      } else {
        const detail = [`compare-and-set refused under lock (ok=${res?.ok}, updated=${res?.updated}); a value changed after it was read`];
        results.push({ entry_id: e.entry_id, question: e.question, status: "conflict", detail });
        console.log(`    NOT applied: ${detail[0]}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ entry_id: e.entry_id, question: e.question, status: "error", detail: [msg] });
      console.log(`    ERROR: ${msg}`);
      if (msg.includes("(401)")) break;
    }
  }

  // Read back what was written.
  if (apply) {
    const done = entries.filter((e) => results.find((r) => r.entry_id === e.entry_id)?.status === "applied");
    const back = new Map<string, Row>();
    const touched = [...new Set(done.flatMap((e) => e.ops.map((o) => o.row_id)))];
    for (let i = 0; i < touched.length; i += 200) {
      const chunk = touched.slice(i, i + 200);
      if (!chunk.length) break;
      for (const r of await runSql(token, `select id, ${Object.keys(FIELDS).join(", ")} from ${TABLE} where id in (${chunk.map((x) => `${q(x)}::uuid`).join(", ")})`)) back.set(r.id, r);
    }
    const wrong = done.flatMap((e) => e.ops.filter((o) => !same(o.field, back.get(o.row_id)?.[o.field], o.new)).map((o) => `${e.entry_id} ${o.row_id.slice(0, 8)}.${o.field}`));
    console.log(`read-back: ${done.reduce((s, e) => s + e.ops.length, 0) - wrong.length} ops confirmed${wrong.length ? `, ${wrong.length} NOT as planned: ${wrong.join(", ")}` : ""}`);
    if (wrong.length) process.exitCode = 1;
  }

  const count = (s: Result["status"]) => results.filter((r) => r.status === s).length;
  console.log(
    `\n${tag}summary: ${apply ? `${count("applied")} applied` : `${count("would-apply")} would apply`}, ${count("already")} already applied, ` +
      `${count("conflict")} conflict, ${count("error")} error`,
  );
  if (count("conflict") || count("error")) process.exitCode = 1;

  const logPath = join(dirname(planPath), `${basename(planPath, ".json")}.applied-log.json`);
  const log: unknown[] = existsSync(logPath) ? JSON.parse(readFileSync(logPath, "utf8")) : [];
  log.push({ run_at: new Date().toISOString(), mode: apply ? "apply" : "dry-run", plan: basename(planPath), plan_kind: plan.kind, only: only ? [...only] : null, results });
  writeFileSync(logPath, JSON.stringify(log, null, 1));
  console.log(`log: ${logPath}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
