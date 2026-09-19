#!/usr/bin/env node
/**
 * screenshots.mjs: phone-width screenshot harness for the BSMS app.
 *
 * Run it from `web/` so `@playwright/test` and `@supabase/supabase-js` resolve
 * from web/node_modules:
 *
 *   node scripts/screenshots.mjs seed
 *   node scripts/screenshots.mjs login student   [--base <url>]
 *   node scripts/screenshots.mjs login teacher   [--base <url>]
 *   node scripts/screenshots.mjs shoot [--base <url>] [--only student|teacher]
 *                                      [--routes a,b] [--tablet]
 *   node scripts/screenshots.mjs teardown
 *
 * Point it at a production server (`npm run build && npx next start -p 3010`).
 * A dev server compiles routes on demand, so the first paint of every route is
 * a spinner and the shot records a page that never exists in production.
 *
 * ── SAFETY ────────────────────────────────────────────────────────────────
 * This talks to the REAL Supabase project. It only ever creates its own two
 * users plus their `profiles` rows, and only ever reads existing data.
 * It NEVER opens /teacher/homework/submission/<id>: a submission whose status
 * is 'submitted' makes that page call `markSubmission()` (src/app/teacher/
 * homework/submission/[submissionId]/page.tsx), which spends paid LLM tokens.
 * `BLOCKED` below refuses the navigation outright, so no discovered link can
 * walk us into one by accident.
 *
 * ── AD-HOC BROWSER PROBES ─────────────────────────────────────────────────
 * Need a one-off page probe rather than a screenshot? Do NOT write a throwaway
 * script in /tmp or the scratchpad: node there resolves neither `playwright`
 * nor `@playwright/test` by bare name, and the installed `@playwright/test` is
 * CJS, so an absolute-path ESM import has no named `chromium` export either.
 * Put the probe under `web/` as a `.cjs` file and
 * `const { chromium } = require("@playwright/test")`, or just drive this
 * harness with `--routes`.
 *
 * ── CREDENTIALS ───────────────────────────────────────────────────────────
 * `login` and `shoot` use, in order:
 *   1. SHOT_STUDENT_EMAIL / SHOT_STUDENT_PASSWORD and
 *      SHOT_TEACHER_EMAIL / SHOT_TEACHER_PASSWORD from web/.env.local.
 *      These keys are LOCAL ONLY. Netlify never needs them.
 *   2. the throwaway users written by `seed` to web/.playwright/seed.json.
 * Both .playwright/ and screenshots/ are gitignored.
 *
 * ── AUTH COOKIE FORMAT (verified against the installed @supabase/ssr 0.12.4) ──
 * Ported from scripts/perf-ttfb.mjs, which documents the provenance in full.
 * The app's server client sets no `cookieOptions.name` and no `cookieEncoding`
 * (src/lib/supabase/server.ts, src/proxy.ts), so every default applies:
 *   1. cookie name = `sb-${hostname.split(".")[0]}-auth-token`
 *      (supabase-js/dist/index.cjs, defaultStorageKey)
 *   2. value = "base64-" + base64url(JSON.stringify(session))
 *      (@supabase/ssr/dist/main/cookies.js, BASE64_PREFIX and cookieEncoding)
 *   3. chunked at MAX_CHUNK_SIZE = 3180 over encodeURIComponent(value) into
 *      `<name>.0`, `<name>.1`, … (@supabase/ssr/dist/main/utils/chunker.js)
 * `shoot` uses this to mint a storage state without a browser round trip when
 * no state file exists yet, so a bare `shoot` still works after `seed`.
 */

import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── paths ────────────────────────────────────────────────────────────────────
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url)); // web/scripts
const WEB_ROOT = path.resolve(SCRIPT_DIR, "..");                 // web
const ENV_FILE = path.join(WEB_ROOT, ".env.local");
const PW_DIR = path.join(WEB_ROOT, ".playwright");
const SEED_FILE = path.join(PW_DIR, "seed.json");
const SHOTS_DIR = path.join(WEB_ROOT, "screenshots");
const DEFAULT_BASE = "http://localhost:3000";
const statePathFor = (role) => path.join(PW_DIR, `state-${role}.json`);

// ── tiny logging helpers (everything diagnostic goes to stderr) ──────────────
const log = (...a) => console.error("[shots]", ...a);
const warn = (...a) => console.error("[shots] WARN", ...a);
function die(...a) {
  console.error("[shots] FATAL", ...a);
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
  return { env, url, anonKey, serviceKey };
}

const serviceClient = (url, serviceKey) => {
  if (!serviceKey) die("SUPABASE_SERVICE_ROLE_KEY not found in .env.local");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
};

const anonClient = (url, anonKey) =>
  createClient(url, anonKey, { auth: { persistSession: false } });

// ── args ─────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      out._.push(a);
      continue;
    }
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

// ── json files ───────────────────────────────────────────────────────────────
function readJson(p) {
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    die(`${p} is not valid JSON: ${e.message}`);
  }
}

function writeJson(p, value, mode) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify(value, null, 2)}\n`, mode ? { mode } : {});
  if (mode) fs.chmodSync(p, mode); // explicit: umask can loosen the create mode
}

// ═════════════════════════════════════════════════════════════════════════════
// cookie construction, ported from @supabase/ssr (see header for provenance)
// ═════════════════════════════════════════════════════════════════════════════

/** @supabase/ssr/dist/main/utils/chunker.js, MAX_CHUNK_SIZE */
const MAX_CHUNK_SIZE = 3180;

/** Verbatim port of createChunks, from chunker.js. */
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

/** supabase-js: the project ref is the first hostname label. */
const projectRef = (supabaseUrl) => new URL(supabaseUrl).hostname.split(".")[0];

/** auth-js storage key / @supabase/ssr cookie name. */
const storageKeyFor = (supabaseUrl) => `sb-${projectRef(supabaseUrl)}-auth-token`;

/** A live Supabase session as the cookie set the app's server client expects. */
function sessionToCookies(supabaseUrl, session) {
  const key = storageKeyFor(supabaseUrl);
  const json = JSON.stringify(session);
  // base64url, unpadded: identical output to ssr's stringToBase64URL
  const encoded = `base64-${Buffer.from(json, "utf8").toString("base64url")}`;
  return createChunks(key, encoded);
}

/** A Playwright storageState carrying those cookies, for `base`'s origin. */
function storageStateFrom(supabaseUrl, session, base) {
  const { hostname, protocol } = new URL(base);
  return {
    cookies: sessionToCookies(supabaseUrl, session).map(({ name, value }) => ({
      name,
      value,
      domain: hostname,
      path: "/",
      expires: -1,
      httpOnly: false,
      secure: protocol === "https:",
      sameSite: "Lax",
    })),
    origins: [],
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// credentials
// ═════════════════════════════════════════════════════════════════════════════

const ROLES = ["student", "teacher"];

function credentialsFor(role, env) {
  const upper = role.toUpperCase();
  const email = env[`SHOT_${upper}_EMAIL`];
  const password = env[`SHOT_${upper}_PASSWORD`];
  if (email && password) return { email, password, source: ".env.local" };

  const seed = readJson(SEED_FILE);
  if (seed?.[role]?.email && seed?.[role]?.password) {
    return { ...seed[role], source: "seed.json" };
  }
  die(
    `no ${role} credentials: set SHOT_${upper}_EMAIL / SHOT_${upper}_PASSWORD ` +
      `in .env.local, or run \`npm run shots:seed\` first.`,
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// seed
// ═════════════════════════════════════════════════════════════════════════════

const randomPassword = () =>
  crypto.randomBytes(24).toString("base64url").slice(0, 24);

async function seed() {
  if (fs.existsSync(SEED_FILE)) {
    die(
      `${SEED_FILE} already exists. Run \`npm run shots:teardown\` first, ` +
        `otherwise the users it describes would be orphaned in the project.`,
    );
  }

  const { url, serviceKey } = loadEnv();
  const db = serviceClient(url, serviceKey);
  const stamp = Date.now();

  // A real class for the teacher to be scoped to. `classes.teacher_id` is left
  // alone; the read-only fallback in src/lib/teacher/scope.ts honours
  // profiles.class_id, so the teacher screens have something to show without
  // this script rewriting anyone's ownership.
  const { data: klass, error: classErr } = await db
    .from("classes")
    .select("id, name, section")
    .limit(1)
    .maybeSingle();
  if (classErr) die(`classes lookup failed: ${classErr.message}`);
  if (klass) log(`teacher will be scoped to class ${klass.name} (${klass.id})`);
  else warn("no rows in `classes`, so the teacher gets no class and sees everything");

  const created = [];
  const makeUser = async (label, email, password) => {
    const { data, error } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) {
      // roll back anything already created so a failed seed leaves nothing behind
      for (const id of created) await db.auth.admin.deleteUser(id).catch(() => {});
      die(`could not create ${label} user ${email}: ${error.message}`);
    }
    created.push(data.user.id);
    log(`created ${label} auth user ${email} (${data.user.id})`);
    return { id: data.user.id, email, password };
  };

  const student = await makeUser(
    "student",
    `shots.student.${stamp}@example.com`,
    randomPassword(),
  );
  const teacher = await makeUser(
    "teacher",
    `shots.teacher.${stamp}@example.com`,
    randomPassword(),
  );

  // class_id NULL on the student keeps it off every roster and leaderboard.
  const rows = [
    {
      id: student.id,
      full_name: "ZZ Shots Student",
      role: "student",
      section: "brothers",
      class_id: null,
      is_active: true,
    },
    {
      id: teacher.id,
      full_name: "ZZ Shots Teacher",
      role: "teacher",
      section: klass?.section ?? "brothers",
      class_id: klass?.id ?? null,
      is_active: true,
    },
  ];
  const { error: profileErr } = await db.from("profiles").insert(rows);
  if (profileErr) {
    for (const id of created) await db.auth.admin.deleteUser(id).catch(() => {});
    die(`profile insert failed: ${profileErr.message}`);
  }
  log("inserted both profiles");

  writeJson(
    SEED_FILE,
    {
      createdAt: new Date().toISOString(),
      supabaseUrl: url,
      projectRef: projectRef(url),
      student,
      teacher,
    },
    0o600,
  );
  log(`credentials written to ${SEED_FILE} (mode 600, it holds passwords)`);
  log("seed complete. Run `shots:login student`, `shots:login teacher`, then `shots`.");
}

// ═════════════════════════════════════════════════════════════════════════════
// teardown
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Deletion order, from web/supabase/migrations/0001_core.sql. Rows OWNED by a
 * throwaway user are deleted; columns where one is merely the ACTOR on someone
 * else's row are nulled and loudly reported, because a screenshot run never writes, so
 * a hit there is a surprise worth knowing about.
 */
async function teardown() {
  const state = readJson(SEED_FILE);
  if (!state) {
    log(`no ${SEED_FILE}, nothing to tear down`);
    return;
  }

  const { url, serviceKey } = loadEnv();
  const db = serviceClient(url, serviceKey);
  const ids = [state.student?.id, state.teacher?.id].filter(Boolean);
  if (ids.length === 0) {
    warn("seed file names no users, just removing the file");
    fs.rmSync(SEED_FILE, { force: true });
    return;
  }
  log(`tearing down ${ids.length} throwaway user(s)`);

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
      warn(`cleared ${table}.${column} on ${data.length} row(s). A shoot wrote data?`);
    }
  };

  // owned rows, children first (answers + voice_notes cascade off submissions)
  await delOwned("submissions", "student_id");
  await delOwned("lesson_watches", "student_id");
  await delOwned("exam_scores", "student_id");
  await delOwned("hifz_profiles", "student_id");
  await delOwned("hifz_records", "student_id");
  await delOwned("attendance", "student_id"); // before strikes, because of attendance.strike_id
  await delOwned("strikes", "student_id");

  // actor references on other people's rows
  await nullActor("submissions", "approved_by");
  await nullActor("exam_scores", "entered_by");
  await nullActor("hifz_records", "marked_by");
  await nullActor("attendance", "recorded_by");
  await nullActor("strikes", "issued_by");
  await nullActor("classes", "teacher_id"); // seed never sets this; belt and braces

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
      // already gone is fine: teardown must be safe to run twice
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
    warn(`seed file kept at ${SEED_FILE} so teardown can be retried`);
    process.exitCode = 1;
    return;
  }

  fs.rmSync(SEED_FILE, { force: true });
  for (const role of ROLES) fs.rmSync(statePathFor(role), { force: true });
  log("teardown complete");
}

// ═════════════════════════════════════════════════════════════════════════════
// login
// ═════════════════════════════════════════════════════════════════════════════

const HOME_FOR = { student: "/home", teacher: "/teacher/home" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One pass at the sign-in form. Returns the landed pathname, or throws. */
async function loginAttempt(context, base, creds) {
  const page = await context.newPage();
  // The form flattens every auth failure to "Incorrect email or password", so
  // the only way to see a rate limit for what it is, is to read the response.
  let authError = null;
  page.on("response", async (res) => {
    if (!res.url().includes("/auth/v1/token")) return;
    if (res.status() < 400) return;
    authError = `HTTP ${res.status()} ${(await res.text().catch(() => "")).slice(0, 200)}`;
  });

  try {
    await page.goto(`${base}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.fill("#email", creds.email);
    await page.fill("#password", creds.password);
    await page.click('button[type="submit"]');

    // The student layout forwards a teacher on to /teacher/home, so either
    // landing counts as a successful sign-in for either role.
    await page.waitForURL(
      (url) => url.pathname === "/home" || url.pathname === "/teacher/home",
      { timeout: 45_000 },
    );
    // A teacher is sent to /home first and forwarded on by the student layout,
    // so give that second hop a moment before reporting where we landed.
    await page
      .waitForURL((url) => url.pathname === HOME_FOR[creds.role], { timeout: 15_000 })
      .catch(() => {});
    return new URL(page.url()).pathname;
  } catch (e) {
    const shown = await page
      .locator("form p.text-danger")
      .first()
      .textContent()
      .catch(() => null);
    throw new Error(
      [e.message.split("\n")[0], shown && `form said: ${shown}`, authError]
        .filter(Boolean)
        .join("; "),
    );
  } finally {
    await page.close();
  }
}

async function login({ role, base }) {
  if (!ROLES.includes(role)) die(`login needs a role: student or teacher`);
  const { env } = loadEnv();
  const creds = { ...credentialsFor(role, env), role };
  log(`signing in as ${role} (${creds.email}, from ${creds.source})`);

  const browser = await chromium.launch();
  const context = await browser.newContext();
  try {
    let landed = null;
    // Supabase rate-limits its auth endpoint, and `seed` has just spent two
    // calls on it, so the sign-in straight after a seed can come back 429 and
    // look to the form exactly like a wrong password. One patient retry.
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        landed = await loginAttempt(context, base, creds);
        break;
      } catch (e) {
        if (attempt === 2) die(`login as ${role} failed: ${e.message}`);
        warn(`login as ${role} failed (${e.message}); retrying in 20s`);
        await sleep(20_000);
      }
    }

    if (landed !== HOME_FOR[role]) {
      warn(`${role} landed on ${landed}, expected ${HOME_FOR[role]}`);
    }

    const statePath = statePathFor(role);
    fs.mkdirSync(PW_DIR, { recursive: true });
    await context.storageState({ path: statePath });
    fs.chmodSync(statePath, 0o600); // it holds a live session
    log(`state saved to ${statePath} (landed on ${landed})`);
  } finally {
    await context.close();
    await browser.close();
  }
}

/**
 * A storage state for `role`, minted without a browser when none was saved.
 * Signs in over the API and encodes the session exactly as @supabase/ssr would.
 */
async function ensureState(role, base, env, supabaseUrl, anonKey) {
  const statePath = statePathFor(role);
  const existing = readJson(statePath);
  if (existing) return existing;

  const creds = credentialsFor(role, env);
  log(`no ${statePath}, minting one by API sign-in (${creds.email})`);
  const client = anonClient(supabaseUrl, anonKey);
  const { data, error } = await client.auth.signInWithPassword({
    email: creds.email,
    password: creds.password,
  });
  if (error) die(`sign-in failed for ${role} (${creds.email}): ${error.message}`);
  if (!data?.session) die(`sign-in for ${role} returned no session`);

  const state = storageStateFrom(supabaseUrl, data.session, base);
  writeJson(statePath, state, 0o600);
  log(`state written to ${statePath}`);
  return state;
}

// ═════════════════════════════════════════════════════════════════════════════
// shoot
// ═════════════════════════════════════════════════════════════════════════════

const STATIC_ROUTES = {
  student: ["/home", "/courses", "/progress", "/hifdh", "/calendar", "/account"],
  teacher: [
    "/teacher/home",
    "/teacher/homework",
    "/teacher/attendance",
    "/teacher/roster",
    "/teacher/hifdh",
    "/teacher/hifdh/hear",
    "/teacher/curriculum",
    "/teacher/calendar",
    "/teacher/classes",
    "/teacher/applications",
    "/teacher/deposits",
    // /teacher/deposits opens on the Money tab, so the roster and costs ledger
    // tables are never in the bare shot. Tabs are query state; slugFor keeps the
    // query, so these land as `teacher-deposits?tab=roster.png` etc.
    "/teacher/deposits?tab=roster",
    "/teacher/deposits?tab=costs",
    "/account",
  ],
};

/**
 * Never navigate here. A 'submitted' submission makes the teacher page call
 * markSubmission(), which spends paid LLM tokens. /teacher/review is the same
 * screen under its older path.
 */
const BLOCKED = [/^\/teacher\/homework\/submission\//, /^\/teacher\/review(\/|$)/];

const isBlocked = (route) => BLOCKED.some((re) => re.test(route));

const PHONE = { width: 390, height: 844 };
const TABLET = { width: 768, height: 1024 };

const slugFor = (route) => {
  const s = route.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\//g, "-");
  return s || "root";
};

/** All in-app pathnames linked from the page, in document order. */
async function hrefsOn(page) {
  const raw = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
  const out = [];
  for (const href of raw) {
    if (!href || !href.startsWith("/") || href.startsWith("//")) continue;
    out.push(href.split("#")[0].split("?")[0]);
  }
  return out;
}

/** goto + fonts + network settle. Throws on a blocked or non-OK route. */
async function visit(page, base, route) {
  if (isBlocked(route)) throw new Error(`refusing to open ${route}: paid LLM marking`);
  const res = await page.goto(`${base}${route}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  const status = res?.status() ?? 0;
  if (status >= 400) throw new Error(`HTTP ${status}`);
  await page.evaluate(() => document.fonts.ready.then(() => true)).catch(() => {});
  // networkidle can never arrive on a page that polls; a timeout here is not
  // a failure, the page is simply still chattering.
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  const landed = new URL(page.url()).pathname;
  if (landed === "/login") throw new Error("bounced to /login, stale session?");
  return landed;
}

/**
 * The dynamic routes, found by following the first matching link on each list
 * page rather than by querying the database. Missing links are normal: the
 * seeded student has no class, so several of its lists are empty.
 */
async function discover(page, base, role, skipped) {
  const found = [];
  const firstMatch = async (from, pattern, label) => {
    try {
      await visit(page, base, from);
    } catch (e) {
      skipped.push(`${role} ${label}: could not open ${from} (${e.message})`);
      return null;
    }
    const hit = (await hrefsOn(page)).find((h) => pattern.test(h) && !isBlocked(h));
    if (!hit) {
      skipped.push(`${role} ${label}: no link matching ${pattern} on ${from}`);
      return null;
    }
    found.push(hit);
    return hit;
  };

  if (role === "teacher") {
    await firstMatch("/teacher/roster", /^\/teacher\/roster\/[^/]+$/, "roster detail");
    await firstMatch("/teacher/classes", /^\/teacher\/classes\/[^/]+$/, "class detail");
    await firstMatch("/teacher/homework", /^\/teacher\/homework\/\d+$/, "homework detail");
    return found;
  }

  const term = await firstMatch("/courses", /^\/courses\/[^/]+$/, "course term");
  if (term) {
    const series = await firstMatch(term, /^\/courses\/[^/]+\/[^/]+$/, "course series");
    if (series) await firstMatch(series, /^\/lessons\/[^/]+$/, "lesson");
  }

  // Homework is linked from the dashboard, and from the progress list when the
  // dashboard has nothing outstanding.
  let hw = await firstMatch("/home", /^\/homework\/\d+$/, "homework from /home");
  if (!hw) hw = await firstMatch("/progress", /^\/homework\/\d+$/, "homework from /progress");

  await firstMatch("/hifdh", /^\/hifdh\/[^/]+$/, "surah");
  return found;
}

async function shoot({ base, only, routesArg, tablet }) {
  const { env, url, anonKey } = loadEnv();
  const roles = only ? [only] : ROLES;
  for (const role of roles) {
    if (!ROLES.includes(role)) die(`--only takes student or teacher, not ${role}`);
  }

  const explicit = routesArg
    ? routesArg.split(",").map((r) => r.trim()).filter(Boolean)
    : null;

  const states = {};
  for (const role of roles) {
    states[role] = await ensureState(role, base, env, url, anonKey);
  }

  const passes = [{ viewport: PHONE, suffix: "" }];
  if (tablet) passes.push({ viewport: TABLET, suffix: "-tablet" });

  const browser = await chromium.launch();
  const saved = [];
  const skipped = [];
  const failed = [];

  try {
    for (const role of roles) {
      // Discover once per role, on a phone-width light context, and reuse the
      // list for every theme and viewport so all the passes are comparable.
      let routes = explicit ?? [...STATIC_ROUTES[role]];
      if (!explicit) {
        const ctx = await browser.newContext({
          viewport: PHONE,
          deviceScaleFactor: 2,
          isMobile: true,
          hasTouch: true,
          colorScheme: "light",
          reducedMotion: "reduce",
          storageState: states[role],
        });
        const page = await ctx.newPage();
        try {
          const dynamic = await discover(page, base, role, skipped);
          routes = [...routes, ...dynamic];
          log(`${role}: ${dynamic.length} dynamic route(s) found: ${dynamic.join(" ") || "none"}`);
        } catch (e) {
          warn(`${role}: route discovery failed: ${e.message}`);
        } finally {
          await ctx.close();
        }
      }

      for (const pass of passes) {
        for (const theme of ["light", "dark"]) {
          const dir = path.join(SHOTS_DIR, role, `${theme}${pass.suffix}`);
          fs.mkdirSync(dir, { recursive: true });

          const ctx = await browser.newContext({
            viewport: pass.viewport,
            deviceScaleFactor: 2,
            isMobile: true,
            hasTouch: true,
            colorScheme: theme, // drives next-themes, which is enableSystem
            reducedMotion: "reduce",
            storageState: states[role],
          });
          const page = await ctx.newPage();

          for (const route of routes) {
            const label = `${role}/${theme}${pass.suffix} ${route}`;
            if (isBlocked(route)) {
              skipped.push(`${label}: blocked route (paid LLM marking)`);
              continue;
            }
            const slug = slugFor(route);
            try {
              await visit(page, base, route);
              await page.screenshot({ path: path.join(dir, `${slug}.png`) });
              await page.screenshot({
                path: path.join(dir, `${slug}.full.png`),
                fullPage: true,
              });
              saved.push(label);
              log(`  ${label} -> ${slug}.png`);
            } catch (e) {
              // One bad route must never end the run.
              failed.push(`${label}: ${e.message.split("\n")[0]}`);
              warn(`  ${label} FAILED: ${e.message.split("\n")[0]}`);
            }
          }
          await ctx.close();
        }
      }
    }
  } finally {
    await browser.close();
  }

  console.log("");
  console.log(`screenshots: ${saved.length} saved, ${skipped.length} skipped, ${failed.length} failed`);
  console.log(`output: ${SHOTS_DIR}`);
  if (skipped.length) {
    console.log("\nskipped:");
    for (const s of skipped) console.log(`  - ${s}`);
  }
  if (failed.length) {
    console.log("\nfailed:");
    for (const f of failed) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// main
// ═════════════════════════════════════════════════════════════════════════════

const USAGE = `usage:
  node scripts/screenshots.mjs seed
  node scripts/screenshots.mjs login <student|teacher> [--base <url>]
  node scripts/screenshots.mjs shoot [--base <url>] [--only student|teacher]
                                     [--routes a,b] [--tablet]
  node scripts/screenshots.mjs teardown

  --base    base url of the running app (default: ${DEFAULT_BASE})
  --only    just one role
  --routes  a comma-separated route list, instead of the built-in set
  --tablet  also take a 768x1024 pass

Run it against \`next start\`, not \`next dev\`.
`;

async function main() {
  const command = process.argv[2];
  const args = parseArgs(process.argv.slice(3));
  const base = (typeof args.base === "string" ? args.base : DEFAULT_BASE).replace(/\/+$/, "");

  switch (command) {
    case "seed":
      await seed();
      break;
    case "login":
      await login({ role: args._[0], base });
      break;
    case "shoot":
      await shoot({
        base,
        only: typeof args.only === "string" ? args.only : null,
        routesArg: typeof args.routes === "string" ? args.routes : null,
        tablet: Boolean(args.tablet),
      });
      break;
    case "teardown":
      await teardown();
      break;
    default:
      process.stderr.write(USAGE);
      process.exit(command ? 1 : 2);
  }
}

main().catch((err) => {
  die(err?.stack ?? String(err));
});
