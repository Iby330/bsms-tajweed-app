#!/usr/bin/env node
/**
 * perf-ttfb.mjs — server TTFB measurement for the BSMS app, as two real
 * signed-in Supabase users (one student, one teacher).
 *
 * Run it from `web/` so `@supabase/supabase-js` resolves from web/node_modules:
 *
 *   node scripts/perf-ttfb.mjs setup   [--state <path>]
 *   node scripts/perf-ttfb.mjs measure [--state <path>] [--base <url>] [--out <path>]
 *   node scripts/perf-ttfb.mjs teardown [--state <path>]
 *
 * Point it at a production-mode server (`npm run build && npx next start -p 3100`).
 * A dev server compiles routes on demand and its numbers mean nothing.
 *
 * ── SAFETY ────────────────────────────────────────────────────────────────
 * This talks to the REAL Supabase project. It only ever creates its own two
 * users plus their `profiles` rows, and only ever reads existing data.
 * It never visits a submission whose status is 'submitted': opening one makes
 * the teacher page call `markSubmission()` (src/app/teacher/homework/
 * submission/[submissionId]/page.tsx:28-30), which spends paid LLM tokens.
 * Only 'approved' submissions are sampled and visited.
 *
 * ── AUTH COOKIE FORMAT (verified against the installed @supabase/ssr 0.12.4) ──
 * The app's server client is created with no `cookieOptions.name` and no
 * `cookieEncoding` (src/lib/supabase/server.ts, src/proxy.ts), so every default
 * below applies:
 *
 *  1. Cookie name = the auth-js storage key. supabase-js derives it as
 *     `sb-${new URL(url).hostname.split(".")[0]}-auth-token`
 *     — node_modules/@supabase/supabase-js/dist/index.cjs:1270
 *       (`const defaultStorageKey = \`sb-${baseUrl.hostname.split(".")[0]}-auth-token\`;`)
 *     i.e. the project ref is the first label of the Supabase hostname.
 *
 *  2. Cookie value = "base64-" + base64url(JSON.stringify(session)).
 *     - BASE64_PREFIX = "base64-"
 *       — node_modules/@supabase/ssr/dist/main/cookies.js:9
 *     - createServerClient defaults cookieEncoding to "base64url"
 *       — node_modules/@supabase/ssr/dist/main/createServerClient.js:16
 *     - the write path is `encoded = BASE64_PREFIX + stringToBase64URL(value)`
 *       — node_modules/@supabase/ssr/dist/main/cookies.js:217-221 (browser storage)
 *         and cookies.js:443-447 (applyServerStorage, server storage)
 *     - stringToBase64URL uses alphabet
 *       "A-Za-z0-9-_" with NO "=" padding
 *       — node_modules/@supabase/ssr/dist/main/utils/base64url.js:17,47-71
 *       which is byte-for-byte Node's Buffer#toString("base64url").
 *     - the plaintext under the prefix is `JSON.stringify(session)`: auth-js
 *       stores the whole session object (user included, because the app sets no
 *       `userStorage`) — node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:4381-4387
 *       (`_saveSession` else-branch) with the stringify happening in
 *       lib/helpers.js:132-134 (`setItemAsync`).
 *
 *  3. Chunking: MAX_CHUNK_SIZE = 3180, measured on encodeURIComponent(value).
 *     Under the limit the cookie is written whole under `<name>`; over it, the
 *     value is split into `<name>.0`, `<name>.1`, … and the reader concatenates
 *     them in order.
 *     — node_modules/@supabase/ssr/dist/main/utils/chunker.js:8 (the constant),
 *       :23-64 (createChunks — the splitting rule ported verbatim below),
 *       :66-84 (combineChunks — the `${key}.${i}` read order).
 *     The Cookie request header carries every chunk.
 *
 * Note on percent-encoding: `cookie.serialize` URL-encodes values on write and
 * `cookie.parse` decodes on read, but a "base64-" + base64url payload contains
 * only unreserved characters, so encodeURIComponent is the identity here. The
 * encode is applied anyway so the header is exactly what a browser would send.
 */

import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── paths ────────────────────────────────────────────────────────────────────
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url)); // web/scripts
const WEB_ROOT = path.resolve(SCRIPT_DIR, "..");                 // web
const REPO_ROOT = path.resolve(WEB_ROOT, "..");                  // repo root
const ENV_FILE = path.join(WEB_ROOT, ".env.local");
const DEFAULT_STATE = path.join(os.tmpdir(), "bsms-perf-ttfb-state.json");
const DEFAULT_BASE = "http://localhost:3100";

// ── tiny logging helpers (everything diagnostic goes to stderr) ──────────────
const log = (...a) => console.error("[perf-ttfb]", ...a);
const warn = (...a) => console.error("[perf-ttfb] WARN", ...a);
function die(...a) {
  console.error("[perf-ttfb] FATAL", ...a);
  process.exit(1);
}

// ── env ──────────────────────────────────────────────────────────────────────
function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) die(`missing env file: ${ENV_FILE}`);
  const env = {};
  for (const raw of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) die("NEXT_PUBLIC_SUPABASE_URL not found in .env.local");
  if (!anonKey) die("NEXT_PUBLIC_SUPABASE_ANON_KEY not found in .env.local");
  return { url, anonKey, serviceKey };
}

const serviceClient = (url, serviceKey) => {
  if (!serviceKey) die("SUPABASE_SERVICE_ROLE_KEY not found in .env.local");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
};

const anonClient = (url, anonKey) =>
  createClient(url, anonKey, { auth: { persistSession: false } });

// ── args ─────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

// ── state file ───────────────────────────────────────────────────────────────
function readState(p) {
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    die(`state file ${p} is not valid JSON: ${e.message}`);
  }
}

function writeState(p, state) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(p, 0o600); // explicit: umask can loosen the create mode
}

// ═════════════════════════════════════════════════════════════════════════════
// cookie construction — ported from @supabase/ssr (see header for file:line)
// ═════════════════════════════════════════════════════════════════════════════

/** @supabase/ssr/dist/main/utils/chunker.js:8 */
const MAX_CHUNK_SIZE = 3180;

/** Verbatim port of createChunks — chunker.js:23-64. */
function createChunks(key, value, chunkSize) {
  const resolvedChunkSize = chunkSize ?? MAX_CHUNK_SIZE;
  let encodedValue = encodeURIComponent(value);
  if (encodedValue.length <= resolvedChunkSize) {
    return [{ name: key, value }];
  }
  const chunks = [];
  while (encodedValue.length > 0) {
    let encodedChunkHead = encodedValue.slice(0, resolvedChunkSize);
    const lastEscapePos = encodedChunkHead.lastIndexOf("%");
    // a truncated %XX escape at the tail is dropped whole
    if (lastEscapePos > resolvedChunkSize - 3) {
      encodedChunkHead = encodedChunkHead.slice(0, lastEscapePos);
    }
    let valueHead = "";
    // walk back until the slice is a valid UTF-8 boundary
    while (encodedChunkHead.length > 0) {
      try {
        valueHead = decodeURIComponent(encodedChunkHead);
        break;
      } catch (error) {
        if (
          error instanceof URIError &&
          encodedChunkHead.at(-3) === "%" &&
          encodedChunkHead.length > 3
        ) {
          encodedChunkHead = encodedChunkHead.slice(0, encodedChunkHead.length - 3);
        } else {
          throw error;
        }
      }
    }
    chunks.push(valueHead);
    encodedValue = encodedValue.slice(encodedChunkHead.length);
  }
  return chunks.map((v, i) => ({ name: `${key}.${i}`, value: v }));
}

/** supabase-js/dist/index.cjs:1270 — project ref is the first hostname label. */
function projectRef(supabaseUrl) {
  return new URL(supabaseUrl).hostname.split(".")[0];
}

/** auth-js storage key / @supabase/ssr cookie name. */
const storageKeyFor = (supabaseUrl) => `sb-${projectRef(supabaseUrl)}-auth-token`;

/**
 * Turns a live Supabase session into the exact `Cookie:` header the app's
 * server client expects. See the header block for the format's provenance.
 */
function sessionToCookieHeader(supabaseUrl, session) {
  const key = storageKeyFor(supabaseUrl);
  const json = JSON.stringify(session);
  // base64url, unpadded — identical output to ssr's stringToBase64URL
  const encoded = `base64-${Buffer.from(json, "utf8").toString("base64url")}`;
  const chunks = createChunks(key, encoded);
  return chunks
    .map(({ name, value }) => `${name}=${encodeURIComponent(value)}`)
    .join("; ");
}

// ═════════════════════════════════════════════════════════════════════════════
// setup
// ═════════════════════════════════════════════════════════════════════════════

const randomPassword = () =>
  crypto.randomBytes(24).toString("base64url").slice(0, 24);

async function setup({ statePath }) {
  if (fs.existsSync(statePath)) {
    die(
      `state file already exists at ${statePath} — run \`teardown\` first, ` +
        `otherwise the users it describes would be orphaned in the project.`,
    );
  }

  const { url, serviceKey } = loadEnv();
  const db = serviceClient(url, serviceKey);
  const stamp = Date.now();

  // ── 1. sample real ids for route params (all read-only) ───────────────────
  log("sampling route parameters from live data (read-only)…");

  const { data: klass, error: classErr } = await db
    .from("classes")
    .select("id, name")
    .limit(1)
    .maybeSingle();
  if (classErr) die(`classes lookup failed: ${classErr.message}`);
  if (!klass) die("no rows in `classes` — nothing to scope a teacher to");
  log(`  class: ${klass.name} (${klass.id})`);

  const { data: classStudent, error: studentErr } = await db
    .from("profiles")
    .select("id")
    .eq("class_id", klass.id)
    .eq("role", "student")
    .limit(1)
    .maybeSingle();
  if (studentErr) die(`class roster lookup failed: ${studentErr.message}`);
  if (!classStudent) die(`class ${klass.name} has no students — /teacher/hifz/<id> unmeasurable`);
  log(`  student in class: ${classStudent.id}`);

  const nowIso = new Date().toISOString();
  const { data: weeks, error: weeksErr } = await db
    .from("weeks")
    .select("id")
    .lte("unlock_at", nowIso);
  if (weeksErr) die(`weeks lookup failed: ${weeksErr.message}`);
  const weekIds = (weeks ?? []).map((w) => w.id);
  if (weekIds.length === 0) die("no unlocked weeks — every lesson/homework page would 404");
  log(`  unlocked weeks: ${weekIds.length}`);

  const { data: lesson, error: lessonErr } = await db
    .from("lessons")
    .select("id")
    .in("week_id", weekIds)
    .limit(1)
    .maybeSingle();
  if (lessonErr) die(`lessons lookup failed: ${lessonErr.message}`);
  if (!lesson) die("no lessons on any unlocked week");
  log(`  unlocked lesson: ${lesson.id}`);

  const { data: homework, error: hwErr } = await db
    .from("homeworks")
    .select("number, week_id")
    .in("week_id", weekIds)
    .order("number")
    .limit(1)
    .maybeSingle();
  if (hwErr) die(`homeworks lookup failed: ${hwErr.message}`);
  if (!homework) die("no homeworks on any unlocked week");
  log(`  homework number: ${homework.number}`);

  // An APPROVED submission only. Never 'submitted' — that would bill LLM marking.
  const { data: classStudents, error: rosterErr } = await db
    .from("profiles")
    .select("id")
    .eq("class_id", klass.id)
    .eq("role", "student");
  if (rosterErr) die(`class roster lookup failed: ${rosterErr.message}`);
  const rosterIds = (classStudents ?? []).map((p) => p.id);

  let submissionId = null;
  if (rosterIds.length > 0) {
    const { data: sub, error: subErr } = await db
      .from("submissions")
      .select("id")
      .in("student_id", rosterIds)
      .eq("status", "approved")
      .limit(1)
      .maybeSingle();
    if (subErr) die(`submissions lookup failed: ${subErr.message}`);
    submissionId = sub?.id ?? null;
  }
  log(
    submissionId
      ? `  approved submission: ${submissionId}`
      : "  approved submission: none found — that route will be skipped",
  );

  // ── 2. create the two auth users ──────────────────────────────────────────
  const created = [];
  const makeUser = async (label, email, password) => {
    const { data, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) {
      // roll back anything already created so a failed setup leaves nothing behind
      for (const id of created) await db.auth.admin.deleteUser(id).catch(() => {});
      die(`could not create ${label} user ${email}: ${error.message}`);
    }
    created.push(data.user.id);
    log(`created ${label} auth user ${email} (${data.user.id})`);
    return { id: data.user.id, email, password };
  };

  const student = await makeUser(
    "student",
    `perf.student.${stamp}@example.com`,
    randomPassword(),
  );
  const teacher = await makeUser(
    "teacher",
    `perf.teacher.${stamp}@example.com`,
    randomPassword(),
  );

  // ── 3. profiles ───────────────────────────────────────────────────────────
  // class_id NULL on the student keeps it off every teacher roster.
  // The teacher gets class_id set: `classes.teacher_id` is left alone (read-only
  // fallback path in src/lib/teacher/scope.ts:34-41 honours profiles.class_id).
  const rows = [
    {
      id: student.id,
      full_name: "ZZ Perf Student",
      role: "student",
      section: "brothers",
      class_id: null,
      is_active: true,
    },
    {
      id: teacher.id,
      full_name: "ZZ Perf Teacher",
      role: "teacher",
      section: "brothers",
      class_id: klass.id,
      is_active: true,
    },
  ];
  const { error: profileErr } = await db.from("profiles").insert(rows);
  if (profileErr) {
    for (const id of created) await db.auth.admin.deleteUser(id).catch(() => {});
    die(`profile insert failed: ${profileErr.message}`);
  }
  log("inserted both profiles");

  // ── 4. persist ────────────────────────────────────────────────────────────
  const state = {
    createdAt: new Date().toISOString(),
    supabaseUrl: url,
    projectRef: projectRef(url),
    student,
    teacher,
    sample: {
      classId: klass.id,
      className: klass.name,
      studentId: classStudent.id,
      lessonId: lesson.id,
      homeworkNumber: homework.number,
      submissionId,
    },
  };
  writeState(statePath, state);
  log(`state written to ${statePath} (mode 600 — it holds passwords)`);
  log("setup complete. Run `measure` next, and ALWAYS `teardown` when done.");
}

// ═════════════════════════════════════════════════════════════════════════════
// measure
// ═════════════════════════════════════════════════════════════════════════════

const WARMUPS = 1;
const SAMPLES = 12;

function routesFor(sample) {
  const student = [
    "/home",
    "/progress",
    "/hifz",
    "/courses",
    "/courses/1",
    `/homework/${sample.homeworkNumber}`,
    `/lessons/${sample.lessonId}`,
  ];
  const teacher = [
    "/teacher/home",
    "/teacher/roster",
    "/teacher/attendance",
    "/teacher/classes",
    "/teacher/hifz",
    `/teacher/hifz/${sample.studentId}`,
    "/teacher/homework",
    `/teacher/homework/${sample.homeworkNumber}`,
    "/teacher/curriculum",
    `/teacher/curriculum/${sample.homeworkNumber}`,
  ];
  // 'approved' only — an unmarked ('submitted') one would trigger paid LLM marking
  if (sample.submissionId) {
    teacher.push(`/teacher/homework/submission/${sample.submissionId}`);
  }
  return { student, teacher };
}

/** One request: TTFB = to the first body chunk, total = to a fully drained body. */
async function timeRequest(url, cookie) {
  const started = performance.now();
  const res = await fetch(url, {
    headers: {
      cookie,
      accept: "text/html,application/xhtml+xml",
      "accept-encoding": "gzip, deflate, br",
      "user-agent": "bsms-perf-ttfb/1.0",
    },
    redirect: "manual",
    cache: "no-store",
  });

  if (!res.body) {
    const at = performance.now() - started;
    return { status: res.status, ttfb: at, total: at };
  }

  const reader = res.body.getReader();
  const first = await reader.read();
  const ttfb = performance.now() - started;
  if (!first.done) {
    // drain
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
    }
  }
  const total = performance.now() - started;
  return { status: res.status, ttfb, total };
}

const percentile = (sorted, p) =>
  sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];

const round1 = (n) => Math.round(n * 10) / 10;

function summarise(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    min: round1(sorted[0]),
    p50: round1(percentile(sorted, 50)),
    p95: round1(percentile(sorted, 95)),
  };
}

function gitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    warn("could not read git commit — recording null");
    return null;
  }
}

async function signIn(url, anonKey, creds, label) {
  const client = anonClient(url, anonKey);
  const { data, error } = await client.auth.signInWithPassword({
    email: creds.email,
    password: creds.password,
  });
  if (error) die(`sign-in failed for ${label} (${creds.email}): ${error.message}`);
  if (!data?.session) die(`sign-in for ${label} returned no session`);
  log(`signed in as ${label} (${creds.email})`);
  return data.session;
}

async function measure({ statePath, base, outPath }) {
  const state = readState(statePath);
  if (!state) die(`no state file at ${statePath} — run \`setup\` first`);
  const { url, anonKey } = loadEnv();

  const baseUrl = base.replace(/\/+$/, "");
  log(`base: ${baseUrl}`);
  log(`cookie name: ${storageKeyFor(url)}`);

  const sessions = {
    student: await signIn(url, anonKey, state.student, "student"),
    teacher: await signIn(url, anonKey, state.teacher, "teacher"),
  };
  const cookies = {
    student: sessionToCookieHeader(url, sessions.student),
    teacher: sessionToCookieHeader(url, sessions.teacher),
  };
  for (const role of ["student", "teacher"]) {
    const chunkCount = cookies[role].split("; ").length;
    log(`${role} cookie: ${cookies[role].length} bytes across ${chunkCount} chunk(s)`);
  }

  const routes = routesFor(state.sample);
  const results = {};
  let failures = 0;

  for (const role of ["student", "teacher"]) {
    for (const route of routes[role]) {
      const label = `${role} ${route}`;
      const target = `${baseUrl}${route}`;
      let status = null;

      try {
        for (let i = 0; i < WARMUPS; i += 1) {
          ({ status } = await timeRequest(target, cookies[role]));
        }
      } catch (e) {
        warn(`${label}: request failed — ${e.message}`);
        results[label] = { status: null, n: 0, failed: true, error: e.message, ttfb_ms: null, total_ms: null };
        failures += 1;
        continue;
      }

      if (status !== 200) {
        warn(`${label}: HTTP ${status} on warm-up — marking failed, skipping timings`);
        results[label] = { status, n: 0, failed: true, ttfb_ms: null, total_ms: null };
        failures += 1;
        continue;
      }

      const ttfbs = [];
      const totals = [];
      let bad = null;
      try {
        for (let i = 0; i < SAMPLES; i += 1) {
          const r = await timeRequest(target, cookies[role]);
          if (r.status !== 200) {
            bad = r.status;
            break;
          }
          ttfbs.push(r.ttfb);
          totals.push(r.total);
        }
      } catch (e) {
        warn(`${label}: request failed mid-run — ${e.message}`);
        results[label] = { status, n: ttfbs.length, failed: true, error: e.message, ttfb_ms: null, total_ms: null };
        failures += 1;
        continue;
      }

      if (bad !== null) {
        warn(`${label}: HTTP ${bad} mid-run — marking failed`);
        results[label] = { status: bad, n: ttfbs.length, failed: true, ttfb_ms: null, total_ms: null };
        failures += 1;
        continue;
      }

      const ttfb = summarise(ttfbs);
      const total = summarise(totals);
      results[label] = { status, n: ttfbs.length, ttfb_ms: ttfb, total_ms: total };
      log(`${label}: ttfb p50 ${ttfb.p50}ms / p95 ${ttfb.p95}ms, total p50 ${total.p50}ms`);
    }
  }

  const payload = {
    meta: { base: baseUrl, when: new Date().toISOString(), commit: gitCommit() },
    routes: results,
  };

  if (outPath) {
    fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
    fs.writeFileSync(path.resolve(outPath), `${JSON.stringify(payload, null, 2)}\n`);
    log(`results written to ${path.resolve(outPath)}`);
  }

  printTable(payload);

  if (failures > 0) {
    warn(`${failures} route(s) failed`);
    process.exitCode = 1;
  }
}

function printTable(payload) {
  const rows = Object.entries(payload.routes).map(([route, r]) => [
    route,
    String(r.status ?? "ERR"),
    r.ttfb_ms ? r.ttfb_ms.p50.toFixed(1) : "—",
    r.ttfb_ms ? r.ttfb_ms.p95.toFixed(1) : "—",
    r.total_ms ? r.total_ms.p50.toFixed(1) : "—",
  ]);
  const head = ["route", "status", "ttfb p50", "ttfb p95", "total p50"];
  const widths = head.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length)),
  );
  const line = (cells) =>
    cells
      .map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i])))
      .join("  ");

  console.log("");
  console.log(`${payload.meta.base}  @ ${payload.meta.commit ?? "unknown"}  ${payload.meta.when}`);
  console.log(line(head));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const r of rows) console.log(line(r));
  console.log("");
}

// ═════════════════════════════════════════════════════════════════════════════
// teardown
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Deletion order, from web/supabase/migrations/0001_core.sql:
 *
 *   ON DELETE CASCADE (children go automatically):
 *     answers.submission_id      → submissions(id)   :115
 *     voice_notes.submission_id  → submissions(id)   :126
 *     profiles.id                → auth.users(id)    :29
 *
 *   NO ACTION (the default — these BLOCK a profiles delete and must be
 *   cleared by hand):
 *     lesson_watches.student_id  :95     submissions.student_id  :104
 *     submissions.approved_by    :108    exam_scores.student_id  :134
 *     exam_scores.entered_by     :137    hifz_profiles.student_id :151
 *     hifz_records.student_id    :157    hifz_records.marked_by  :161
 *     strikes.student_id         :168    strikes.issued_by       :172
 *     attendance.student_id      :179    attendance.recorded_by  :185
 *     attendance.strike_id       :184 → strikes(id)  (so attendance BEFORE strikes)
 *     classes.teacher_id         :38-39
 *
 * Rows OWNED by a test user are deleted. Columns where a test user is merely
 * the ACTOR on someone else's row are set to NULL instead, and loudly reported —
 * a perf run never writes, so any hit there is a surprise worth knowing about.
 */
async function teardown({ statePath }) {
  const state = readState(statePath);
  if (!state) {
    log(`no state file at ${statePath} — nothing to tear down`);
    return;
  }

  const { url, serviceKey } = loadEnv();
  const db = serviceClient(url, serviceKey);
  const ids = [state.student?.id, state.teacher?.id].filter(Boolean);
  if (ids.length === 0) {
    warn("state file names no users — just removing the file");
    fs.rmSync(statePath, { force: true });
    return;
  }
  log(`tearing down ${ids.length} test user(s)`);

  let hardFailure = false;

  const delOwned = async (table, column) => {
    const { data, error } = await db.from(table).delete().in(column, ids).select();
    if (error) {
      warn(`delete from ${table} failed: ${error.message}`);
      hardFailure = true;
      return;
    }
    if (data?.length) log(`  deleted ${data.length} row(s) from ${table}`);
  };

  const nullActor = async (table, column) => {
    const { data, error } = await db
      .from(table)
      .update({ [column]: null })
      .in(column, ids)
      .select();
    if (error) {
      warn(`clearing ${table}.${column} failed: ${error.message}`);
      hardFailure = true;
      return;
    }
    if (data?.length) {
      warn(`cleared ${table}.${column} on ${data.length} row(s) — a perf run wrote data?`);
    }
  };

  // owned rows, children first (answers + voice_notes cascade off submissions)
  await delOwned("submissions", "student_id");
  await delOwned("lesson_watches", "student_id");
  await delOwned("exam_scores", "student_id");
  await delOwned("hifz_profiles", "student_id");
  await delOwned("hifz_records", "student_id");
  await delOwned("attendance", "student_id"); // before strikes — attendance.strike_id
  await delOwned("strikes", "student_id");

  // actor references on other people's rows
  await nullActor("submissions", "approved_by");
  await nullActor("exam_scores", "entered_by");
  await nullActor("hifz_records", "marked_by");
  await nullActor("attendance", "recorded_by");
  await nullActor("strikes", "issued_by");
  await nullActor("classes", "teacher_id"); // setup never sets this; belt and braces

  // profiles (deleting the auth user would cascade here anyway, but doing it
  // explicitly surfaces any FK we missed as a clear error rather than a 500)
  const { error: profileErr } = await db.from("profiles").delete().in("id", ids);
  if (profileErr) {
    warn(`profiles delete failed: ${profileErr.message}`);
    hardFailure = true;
  } else {
    log("  deleted profile row(s)");
  }

  for (const id of ids) {
    const { error } = await db.auth.admin.deleteUser(id);
    if (error) {
      // already gone is fine — teardown must be safe to run twice
      if (/not.?found/i.test(error.message)) {
        log(`  auth user ${id} already gone`);
      } else {
        warn(`deleting auth user ${id} failed: ${error.message}`);
        hardFailure = true;
      }
    } else {
      log(`  deleted auth user ${id}`);
    }
  }

  if (hardFailure) {
    warn(`state file kept at ${statePath} so teardown can be retried`);
    process.exitCode = 1;
    return;
  }

  fs.rmSync(statePath, { force: true });
  log("teardown complete");
}

// ═════════════════════════════════════════════════════════════════════════════
// main
// ═════════════════════════════════════════════════════════════════════════════

const USAGE = `usage:
  node scripts/perf-ttfb.mjs setup    [--state <path>]
  node scripts/perf-ttfb.mjs measure  [--state <path>] [--base <url>] [--out <path>]
  node scripts/perf-ttfb.mjs teardown [--state <path>]

  --state  JSON state file (default: ${DEFAULT_STATE})
  --base   base url of the running app (default: ${DEFAULT_BASE})
  --out    where to write the results JSON
`;

async function main() {
  const command = process.argv[2];
  const args = parseArgs(process.argv.slice(3));
  const statePath = path.resolve(
    typeof args.state === "string" ? args.state : DEFAULT_STATE,
  );

  switch (command) {
    case "setup":
      await setup({ statePath });
      break;
    case "measure":
      await measure({
        statePath,
        base: typeof args.base === "string" ? args.base : DEFAULT_BASE,
        outPath: typeof args.out === "string" ? args.out : null,
      });
      break;
    case "teardown":
      await teardown({ statePath });
      break;
    default:
      process.stderr.write(USAGE);
      process.exit(command ? 1 : 2);
  }
}

main().catch((err) => {
  die(err?.stack ?? String(err));
});
