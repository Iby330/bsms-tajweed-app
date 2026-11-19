/**
 * exam_bank_import.ts — load the merged exam question bank into Supabase.
 *
 *   npx tsx execution/exam_bank_import.ts <bank.json> [--dry-run] [--prune] [--env <path>]
 *
 * Input: bank.json written by execution/exam_bank_merge.py ({images, questions}).
 * Writes ONLY to the `exam_bank_questions` table and the private `exam-questions`
 * bucket (migration 0152), with the service role key.
 *
 * Running it (the env file holds the keys; never print them):
 *   - From the worktree: web/.env.local was copied in, so the default works:
 *       cd "<repo or worktree root>" && npx tsx execution/exam_bank_import.ts <bank.json> --dry-run
 *     If `npx tsx` is not found, call the binary directly: web/node_modules/.bin/tsx execution/…
 *   - Anywhere without its own web/.env.local, point at the main checkout's:
 *       --env "/Users/ibrahimramadan/BSMS Tajweed app/web/.env.local"
 *   NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are read from that
 *   file; real environment variables of the same name win over it.
 *
 * What it does
 *   1. Checks bank.json: every topic exists in exam_bank_topics, every picture
 *      a question names is in `images`, each local file still has the sha1 its
 *      storage name claims, and is under the bucket's 3 MB limit. Any failure
 *      stops the run before a single write.
 *   2. Uploads pictures to exam-questions/<storage_path> (bank/<sha1>.<ext>,
 *      upsert:false). The bank/ folder is listed once, paged; an object of the
 *      same size is skipped.
 *   3. Upserts exam_bank_questions on import_key, 100 rows a batch. Existing rows
 *      are fetched first and a payload computed per row:
 *        - used_in = existing ∪ incoming (the app's "mark as final" stamps survive);
 *        - an 'approved' row keeps review_status, review_note AND its content
 *          (an admin has looked and may have corrected it); only used_in and
 *          sources are unioned into it;
 *        - archived, created_at and created_by are never sent;
 *        - a row whose payload equals what is stored is not sent at all.
 *   4. Stale rows (import_key set, key no longer in bank.json): reported; with
 *      --prune, deleted, or archived when an exam_paper_items row points at them.
 *   5. Verification read: totals, per parent topic, per status, rows with
 *      pictures, and rows whose topic_id is missing from exam_bank_topics (must be 0).
 *
 * --dry-run makes no writes at all; it still reads (counts, existing rows, the
 * bucket listing) so it proves the connection and shows exactly what would change.
 * Idempotent: a second run reports 0 uploads, 0 inserts, 0 updates.
 *
 * Gotchas
 *   - This file lives outside web/, so tsx compiles it as CJS: no top-level await,
 *     everything runs inside main(). supabase-js is resolved from web/node_modules.
 *   - PostgREST bulk upsert fills keys missing from SOME objects with NULL, so every
 *     object in a batch carries the same full key set.
 *   - marks is numeric(4,1): incoming marks are rounded to one decimal before the
 *     comparison, or a value like 0.25 would show as "changed" on every run.
 *   - jsonb comes back with its keys reordered; comparisons use a key-sorted
 *     canonical JSON form.
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

const here = dirname(resolve(process.argv[1] ?? "execution/exam_bank_import.ts"));
const repoRoot = join(here, "..");
const { createClient } = createRequire(join(repoRoot, "web/package.json"))("@supabase/supabase-js");

const BUCKET = "exam-questions";
const BATCH = 100;
const MAX_BYTES = 3 * 1024 * 1024;
const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

type Option = { text: string; image: string | null; correct: boolean };
type Source = { label: string; kind: string; number?: string };
type BankQuestion = {
  import_key: string;
  topic_id: string;
  kind: "mcq" | "short";
  prompt: string;
  prompt_images: string[];
  prompt_quran: Record<string, number> | null;
  options: Option[] | null;
  select_many: boolean;
  answer: string | null;
  marks: number | null;
  sources: Source[];
  used_in: string[];
  review_status: "clean" | "check";
  review_note: string | null;
};
type BankFile = {
  generated_at: string;
  images: Record<string, { storage_path: string; local_file: string; bytes: number; sha1?: string }>;
  questions: BankQuestion[];
};
type Row = Omit<BankQuestion, "review_status"> & {
  id: string;
  review_status: "clean" | "check" | "approved";
  archived: boolean;
};

const CONTENT_COLS = [
  "topic_id",
  "kind",
  "prompt",
  "prompt_images",
  "prompt_quran",
  "options",
  "select_many",
  "answer",
  "marks",
] as const;
const SEND_COLS = [...CONTENT_COLS, "sources", "used_in", "review_status", "review_note"] as const;
type Payload = { import_key: string } & Record<(typeof SEND_COLS)[number], unknown>;

// ── args & env ────────────────────────────────────────────────────────────

function parseArgs() {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter((a) => a === "--dry-run" || a === "--prune"));
  const envAt = argv.indexOf("--env");
  const envPath = envAt >= 0 ? argv[envAt + 1] : join(repoRoot, "web/.env.local");
  const positional = argv.filter((a, i) => !a.startsWith("--") && !(envAt >= 0 && i === envAt + 1));
  const unknown = argv.filter((a) => a.startsWith("--") && !["--dry-run", "--prune", "--env"].includes(a));
  if (positional.length !== 1 || unknown.length) {
    console.error("usage: npx tsx execution/exam_bank_import.ts <bank.json> [--dry-run] [--prune] [--env <path>]");
    process.exit(2);
  }
  return { bankPath: positional[0], dryRun: flags.has("--dry-run"), prune: flags.has("--prune"), envPath };
}

function loadEnv(path: string): { url: string; key: string } {
  const env: Record<string, string> = {};
  if (existsSync(path)) {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const i = line.indexOf("=");
      if (i > 0 && !line.trimStart().startsWith("#")) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    }
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      `NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not found in ${path} or the environment.\n` +
        `Pass --env "/Users/ibrahimramadan/BSMS Tajweed app/web/.env.local".`,
    );
    process.exit(2);
  }
  return { url, key };
}

// ── helpers ───────────────────────────────────────────────────────────────

function canon(v: unknown): string {
  if (v === undefined) return "null";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canon(o[k])}`)
    .join(",")}}`;
}

function roundMarks(m: unknown): number | null {
  if (m === null || m === undefined || m === "") return null;
  const n = Number(m);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

function union(a: string[] | null | undefined, b: string[]): string[] {
  const out = [...(a ?? [])];
  for (const x of b) if (!out.includes(x)) out.push(x);
  return out;
}

function unionSources(a: Source[] | null | undefined, b: Source[]): Source[] {
  const out = [...(a ?? [])];
  const seen = new Set(out.map((s) => `${s.label}\u0000${s.kind}\u0000${s.number ?? ""}`));
  for (const s of b) {
    const k = `${s.label}\u0000${s.kind}\u0000${s.number ?? ""}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(s);
    }
  }
  return out;
}

const parentOf = (topic: string) => topic.split(".")[0];

function tally<T>(items: T[], key: (t: T) => string): string {
  const c = new Map<string, number>();
  for (const i of items) c.set(key(i), (c.get(key(i)) ?? 0) + 1);
  return [...c.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([k, n]) => `${k} ${n}`)
    .join(", ");
}

function chunks<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

// ── main ─────────────────────────────────────────────────────────────────

async function main() {
  const { bankPath, dryRun, prune, envPath } = parseArgs();
  const { url, key } = loadEnv(envPath);
  const db = createClient(url, key, { auth: { persistSession: false } });
  const tag = dryRun ? "[dry-run] " : "";

  const bank: BankFile = JSON.parse(readFileSync(bankPath, "utf8"));
  const questions = bank.questions ?? [];
  console.log(`${tag}bank.json: ${questions.length} questions, ${Object.keys(bank.images ?? {}).length} pictures (generated ${bank.generated_at})`);

  // ── 1. checks before any write ──
  const { data: topicRows, error: topicErr } = await db.from("exam_bank_topics").select("id");
  if (topicErr) throw new Error(`reading exam_bank_topics: ${topicErr.message}`);
  const topicIds = new Set<string>((topicRows ?? []).map((t: { id: string }) => t.id));
  const problems: string[] = [];
  const keys = new Set<string>();
  for (const q of questions) {
    if (!q.import_key) problems.push(`a question has no import_key: ${q.prompt.slice(0, 60)}`);
    if (keys.has(q.import_key)) problems.push(`duplicate import_key ${q.import_key}`);
    keys.add(q.import_key);
    if (!topicIds.has(q.topic_id)) problems.push(`${q.import_key}: topic ${q.topic_id} not in exam_bank_topics`);
    if (!["mcq", "short"].includes(q.kind)) problems.push(`${q.import_key}: kind ${q.kind}`);
    if (!["clean", "check"].includes(q.review_status)) problems.push(`${q.import_key}: review_status ${q.review_status}`);
    for (const p of [...q.prompt_images, ...(q.options ?? []).map((o) => o.image).filter((x): x is string => !!x)]) {
      if (!bank.images[p]) problems.push(`${q.import_key}: picture ${p} not in images`);
    }
  }
  const imageEntries = Object.values(bank.images ?? {});
  const fileBytes = new Map<string, Buffer>();
  for (const im of imageEntries) {
    const m = /^bank\/([0-9a-f]{40})\.(png|jpg|gif|webp)$/.exec(im.storage_path);
    if (!m) {
      problems.push(`bad storage path ${im.storage_path}`);
      continue;
    }
    if (!existsSync(im.local_file)) {
      problems.push(`${im.storage_path}: local file missing (${im.local_file})`);
      continue;
    }
    const size = statSync(im.local_file).size;
    if (size > MAX_BYTES) problems.push(`${im.storage_path}: ${size} bytes is over the bucket's 3 MB limit`);
    const buf = readFileSync(im.local_file);
    if (createHash("sha1").update(buf).digest("hex") !== m[1]) {
      problems.push(`${im.storage_path}: local file changed since the merge (sha1 differs) — re-run the merge`);
    }
    fileBytes.set(im.storage_path, buf);
  }
  if (problems.length) {
    console.error(`bank.json failed ${problems.length} check(s); nothing written:\n  ` + problems.slice(0, 40).join("\n  "));
    process.exit(1);
  }

  // ── 2. pictures ──
  const present = new Map<string, number>(); // name → size
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(BUCKET).list("bank", { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`listing ${BUCKET}/bank: ${error.message}`);
    for (const o of data ?? []) if (o.id) present.set(`bank/${o.name}`, Number(o.metadata?.size ?? -1));
    if (!data || data.length < 1000) break;
  }
  const toUpload = imageEntries.filter((im) => present.get(im.storage_path) !== im.bytes);
  const sizeClash = toUpload.filter((im) => present.has(im.storage_path));
  let uploaded = 0;
  const uploadErrors: string[] = [];
  if (sizeClash.length) {
    // Same content hash, different size: should be impossible. Report, never overwrite.
    for (const im of sizeClash) uploadErrors.push(`${im.storage_path}: stored size ${present.get(im.storage_path)} ≠ ${im.bytes}`);
  }
  const fresh = toUpload.filter((im) => !present.has(im.storage_path));
  console.log(
    `${tag}pictures: ${imageEntries.length} referenced, ${present.size} already in ${BUCKET}/bank, ` +
      `${fresh.length} to upload (${(fresh.reduce((s, im) => s + im.bytes, 0) / 1024).toFixed(0)} KB)`,
  );
  if (!dryRun) {
    for (const im of fresh) {
      const ext = im.storage_path.split(".").pop()!;
      const { error } = await db.storage
        .from(BUCKET)
        .upload(im.storage_path, fileBytes.get(im.storage_path)!, { contentType: CONTENT_TYPES[ext], upsert: false });
      if (error && !/exists|duplicate/i.test(error.message)) uploadErrors.push(`${im.storage_path}: ${error.message}`);
      else if (!error) uploaded++;
    }
    console.log(`pictures uploaded: ${uploaded}`);
  }
  if (uploadErrors.length) {
    console.error(`picture problems (${uploadErrors.length}); rows NOT written:\n  ` + uploadErrors.slice(0, 20).join("\n  "));
    process.exit(1);
  }

  // ── 3. rows ──
  const existing = new Map<string, Row>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("exam_bank_questions")
      .select(`id, import_key, review_status, archived, ${SEND_COLS.filter((c) => c !== "review_status").join(", ")}`)
      .not("import_key", "is", null)
      .order("import_key")
      .range(from, from + 999);
    if (error) throw new Error(`reading exam_bank_questions: ${error.message}`);
    for (const r of (data ?? []) as Row[]) existing.set(r.import_key, r);
    if (!data || data.length < 1000) break;
  }

  const inserts: Payload[] = [];
  const updates: { payload: Payload; changed: string[] }[] = [];
  let unchanged = 0;
  let approvedKept = 0;
  for (const q of questions) {
    const incoming: Payload = {
      import_key: q.import_key,
      topic_id: q.topic_id,
      kind: q.kind,
      prompt: q.prompt,
      prompt_images: q.prompt_images ?? [],
      prompt_quran: q.prompt_quran ?? null,
      options: q.kind === "mcq" ? q.options ?? null : null,
      select_many: !!q.select_many,
      answer: q.answer ?? null,
      marks: roundMarks(q.marks),
      sources: q.sources ?? [],
      used_in: q.used_in ?? [],
      review_status: q.review_status,
      review_note: q.review_note ?? null,
    };
    const row = existing.get(q.import_key);
    if (!row) {
      inserts.push(incoming);
      continue;
    }
    const payload: Payload = { ...incoming, used_in: union(row.used_in, incoming.used_in as string[]) };
    if (row.review_status === "approved") {
      approvedKept++;
      for (const c of CONTENT_COLS) (payload as Record<string, unknown>)[c] = (row as Record<string, unknown>)[c];
      payload.marks = roundMarks(row.marks);
      payload.review_status = "approved";
      payload.review_note = row.review_note;
      payload.sources = unionSources(row.sources, incoming.sources as Source[]);
    }
    const changed = SEND_COLS.filter((c) => {
      const a = c === "marks" ? roundMarks(row.marks) : (row as Record<string, unknown>)[c];
      return canon(a) !== canon(payload[c]);
    });
    if (changed.length) updates.push({ payload, changed });
    else unchanged++;
  }

  const stale = [...existing.values()].filter((r) => !keys.has(r.import_key));
  console.log(
    `${tag}rows: ${inserts.length} to insert, ${updates.length} to update, ${unchanged} unchanged` +
      (approvedKept ? ` (${approvedKept} approved rows: content kept, only used_in/sources merged)` : "") +
      `, ${stale.length} stale (in the table, not in bank.json)`,
  );
  if (updates.length) {
    const cols = new Map<string, number>();
    for (const u of updates) for (const c of u.changed) cols.set(c, (cols.get(c) ?? 0) + 1);
    console.log(`${tag}  columns changing: ${[...cols].map(([c, n]) => `${c} ${n}`).join(", ")}`);
    for (const u of updates.slice(0, 5)) console.log(`${tag}  e.g. ${u.payload.import_key}: ${u.changed.join(", ")}`);
  }
  console.log(`${tag}incoming by parent topic: ${tally(questions, (q) => parentOf(q.topic_id))}`);
  console.log(`${tag}incoming by status: ${tally(questions, (q) => q.review_status)}`);

  if (!dryRun) {
    const toSend = [...inserts, ...updates.map((u) => u.payload)];
    let sent = 0;
    for (const batch of chunks(toSend, BATCH)) {
      const { error } = await db.from("exam_bank_questions").upsert(batch, { onConflict: "import_key" });
      if (error) throw new Error(`upsert batch at ${sent}: ${error.message}`);
      sent += batch.length;
    }
    console.log(`rows written: ${inserts.length} inserted, ${updates.length} updated`);
  }

  // ── 4. stale rows ──
  if (stale.length) {
    const referenced = new Set<string>();
    for (const ids of chunks(stale.map((r) => r.id), BATCH)) {
      const { data, error } = await db.from("exam_paper_items").select("bank_question_id").in("bank_question_id", ids);
      if (error) throw new Error(`reading exam_paper_items: ${error.message}`);
      for (const r of data ?? []) referenced.add(r.bank_question_id);
    }
    const toArchive = stale.filter((r) => referenced.has(r.id) && !r.archived);
    const toDelete = stale.filter((r) => !referenced.has(r.id));
    if (!prune || dryRun) {
      console.log(
        `${tag}stale rows: ${stale.length} (${toDelete.length} deletable, ${referenced.size} on a paper → would be archived)` +
          (prune ? "" : " — pass --prune to remove them"),
      );
    } else {
      for (const ids of chunks(toArchive.map((r) => r.id), BATCH)) {
        const { error } = await db.from("exam_bank_questions").update({ archived: true }).in("id", ids);
        if (error) throw new Error(`archiving stale rows: ${error.message}`);
      }
      for (const ids of chunks(toDelete.map((r) => r.id), BATCH)) {
        const { error } = await db.from("exam_bank_questions").delete().in("id", ids);
        if (error) throw new Error(`deleting stale rows: ${error.message}`);
      }
      console.log(`stale rows: ${toDelete.length} deleted, ${toArchive.length} archived (on a paper)`);
    }
  }

  // ── 5. verification read ──
  const all: { topic_id: string; review_status: string; prompt_images: string[]; options: Option[] | null; import_key: string | null; archived: boolean }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("exam_bank_questions")
      .select("topic_id, review_status, prompt_images, options, import_key, archived")
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(`verification read: ${error.message}`);
    all.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const withPictures = all.filter((r) => (r.prompt_images ?? []).length || (r.options ?? []).some((o) => o.image));
  const orphans = all.filter((r) => !topicIds.has(r.topic_id));
  console.log(`\nverify (live table${dryRun ? ", unchanged by this dry run" : ""}):`);
  console.log(`  exam_bank_topics: ${topicIds.size}`);
  console.log(`  exam_bank_questions: ${all.length} rows (${all.filter((r) => r.import_key).length} imported, ${all.filter((r) => r.archived).length} archived)`);
  if (all.length) {
    console.log(`  by parent topic: ${tally(all, (r) => parentOf(r.topic_id))}`);
    console.log(`  by status: ${tally(all, (r) => r.review_status)}`);
  }
  console.log(`  with pictures: ${withPictures.length}`);
  console.log(`  topic_id missing from exam_bank_topics: ${orphans.length}`);
  if (orphans.length) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
