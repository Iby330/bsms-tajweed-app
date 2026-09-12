/**
 * seed_revision_activity_demo.ts — six months of revision activity for one
 * demo student, so the Hifdh heatmap has a full grid to show.
 *
 * Two things feed the heatmap, and this script populates both for Adam
 * Whitfield (reviewed by Bilal Osei):
 *
 *  1. hifz_records.passed_at — his existing sign-offs are dated Oct 2026 →
 *     Jan 2027, in the FUTURE and past the academic year's end, so nothing
 *     of his shows in a trailing window. They are re-dated to march down the
 *     memorisation order across the last ~26 weeks, one every 5–8 days with
 *     two double days. Only passed_at changes; comments and marked_by stay.
 *     The previous dates are written to a backup file first (see below).
 *
 *  2. revision_sessions — one submitted session with Bilal on roughly half
 *     of the days, weekday-heavy, with a quiet fortnight in the middle (half
 *     term) and an unbroken run over the final twelve days. Every sign-off
 *     lands on a session day, since that is when a sign-off happens. The
 *     sessions carry no mistakes: a clean session is a real outcome, and
 *     inventing mistakes at random would put wrong rules on real words —
 *     the four detailed sessions from seed_peer_review_demo.ts stay as the
 *     mistakes to look at.
 *
 * Deterministic: a fixed-seed generator, so every run produces the same
 * dates, and fixed session ids (one per day offset), so a re-run replaces
 * its own rows rather than piling up.
 *
 * Run:      npx tsx execution/seed_revision_activity_demo.ts
 * Clear:    npx tsx execution/seed_revision_activity_demo.ts --clear
 *           removes the seeded sessions and restores passed_at from the most
 *           recent backup in .claude/skill-research/seed_revision_activity_demo/
 * Demo tooling — writes with the service role and bypasses RLS.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const BACKUP_DIR = join(repoRoot, ".claude/skill-research/seed_revision_activity_demo");

const env: Record<string, string> = {};
for (const line of readFileSync(join(repoRoot, "web/.env.local"), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const RECITER = "Adam Whitfield";
const REVIEWER = "Bilal Osei";
const WEEKS = 27;                       // matches the heatmap's default window
const DAYS = WEEKS * 7;
const ID_PREFIX = "d1a55200-0000-4000-8000-";   // + 12 hex digits of day offset
const sessionId = (offset: number) => ID_PREFIX + offset.toString(16).padStart(12, "0");
const ALL_IDS = Array.from({ length: DAYS }, (_, i) => sessionId(i));

// Fixed-seed LCG — same numbers every run, so the grid is stable across re-seeds.
let state = 20260912;
const rnd = () => ((state = (state * 1103515245 + 12345) % 2147483648) / 2147483648);

const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
/** Midnight local, `offset` days before today. offset 1 = yesterday. */
const dayAgo = (offset: number) => {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return new Date(t.getTime() - offset * DAY_MS);
};

async function profileId(name: string): Promise<string> {
  const { data, error } = await db.from("profiles").select("id, full_name").eq("full_name", name);
  if (error) throw error;
  if (!data?.length) throw new Error(`No profile named "${name}" — is the demo seed applied?`);
  if (data.length > 1) throw new Error(`Several profiles named "${name}"; refusing to guess.`);
  return data[0].id;
}

async function clear(reciter: string) {
  const { error } = await db.from("revision_sessions").delete().in("id", ALL_IDS);
  if (error) throw error;
  console.log(`removed seeded sessions`);
  if (!existsSync(BACKUP_DIR)) return console.log("no backup dir — passed_at left as is");
  const latest = readdirSync(BACKUP_DIR).filter((f) => f.endsWith(".json")).sort().at(-1);
  if (!latest) return console.log("no backup file — passed_at left as is");
  const rows = JSON.parse(readFileSync(join(BACKUP_DIR, latest), "utf8")) as
    { surah_number: number; passed_at: string }[];
  for (const r of rows) {
    const { error: ue } = await db.from("hifz_records").update({ passed_at: r.passed_at })
      .eq("student_id", reciter).eq("surah_number", r.surah_number);
    if (ue) throw ue;
  }
  console.log(`restored ${rows.length} passed_at dates from ${latest}`);
}

async function main() {
  const [reciter, reviewer] = await Promise.all([profileId(RECITER), profileId(REVIEWER)]);
  if (process.argv.includes("--clear")) return clear(reciter);
  console.log(`reciter  ${RECITER}  ${reciter}`);
  console.log(`reviewer ${REVIEWER}  ${reviewer}`);

  const { data: pair } = await db.from("revision_pairs").select("id").eq("active", true)
    .or(`and(student_a.eq.${reviewer},student_b.eq.${reciter}),` +
        `and(student_a.eq.${reciter},student_b.eq.${reviewer})`);
  if (!pair?.length) {
    throw new Error(`No active revision pair between ${REVIEWER} and ${RECITER}. ` +
      `Assign them as partners in the teacher UI first — this script will not invent one.`);
  }

  // ── 1. sign-offs: back up, then re-date down the memorisation order ──────
  const { data: recs, error: re } = await db.from("hifz_records")
    .select("surah_number, passed_at").eq("student_id", reciter)
    .order("surah_number", { ascending: false });   // 114 first — the order he learns them
  if (re) throw re;
  if (!recs?.length) throw new Error(`${RECITER} has no hifz_records to re-date.`);

  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = join(BACKUP_DIR, `passed_at-${stamp}.json`);
  writeFileSync(backup, JSON.stringify(recs, null, 2));
  console.log(`backed up ${recs.length} passed_at dates → ${backup}\n`);

  // Space the sign-offs so the last lands a few days ago; the first sits a
  // little inside the window's start. Two doubles keep it from looking metronomic.
  const DOUBLES = new Set([7, 19]);
  const signOffOffsets: number[] = [];
  let offset = DAYS - 5;
  for (let i = 0; i < recs.length; i++) {
    if (i > 0 && !DOUBLES.has(i)) offset -= 5 + Math.floor(rnd() * 4);   // 5–8 days on
    signOffOffsets.push(Math.max(3, offset));
  }
  const signOffDays = new Set(signOffOffsets);

  // ── 2. sessions: weekday-heavy, a quiet fortnight, a strong final run ────
  const P_BY_WEEKDAY = [0.3, 0.7, 0.7, 0.68, 0.7, 0.5, 0.35];   // Sun..Sat
  const QUIET = { from: DAYS - 14 * 7, to: DAYS - 12 * 7 };    // half term, weeks 12–13 in
  const sessions: { id: string; at: Date; flags: string[] }[] = [];
  for (let off = DAYS - 1; off >= 1; off--) {                  // never today
    const d = dayAgo(off);
    let p = P_BY_WEEKDAY[d.getDay()];
    if (off >= QUIET.from && off < QUIET.to) p = 0.05;
    if (off <= 12) p = 1;                                      // the closing streak
    if (signOffDays.has(off)) p = 1;                           // a sign-off IS a session
    if (rnd() >= p) continue;
    const r = rnd();
    const flags = r < 0.22 ? ["strong"] : r < 0.32 ? ["halting"] : [];
    d.setHours(16 + Math.floor(rnd() * 3), Math.floor(rnd() * 60), 0, 0);   // 4–7pm
    sessions.push({ id: sessionId(off), at: d, flags });
  }

  // replace, never accumulate
  const { error: de } = await db.from("revision_sessions").delete().in("id", ALL_IDS);
  if (de) throw de;
  for (let i = 0; i < sessions.length; i += 50) {
    const { error: se } = await db.from("revision_sessions").insert(
      sessions.slice(i, i + 50).map((s) => ({
        id: s.id, reciter_id: reciter, reviewer_id: reviewer,
        started_at: s.at.toISOString(), submitted_at: s.at.toISOString(),
        overall_note: null, flags: s.flags,
      })),
    );
    if (se) throw se;
  }

  for (const [i, r] of recs.entries()) {
    const { error: ue } = await db.from("hifz_records")
      .update({ passed_at: iso(dayAgo(signOffOffsets[i])) })
      .eq("student_id", reciter).eq("surah_number", r.surah_number);
    if (ue) throw ue;
  }

  const first = iso(dayAgo(DAYS - 1)), last = iso(dayAgo(1));
  console.log(`window   ${first} → ${last}  (${DAYS} days)`);
  console.log(`sessions ${sessions.length} submitted  ` +
              `(strong ${sessions.filter((s) => s.flags.includes("strong")).length}, ` +
              `halting ${sessions.filter((s) => s.flags.includes("halting")).length})`);
  console.log(`sign-offs ${recs.length} re-dated: ` +
              `${iso(dayAgo(signOffOffsets[0]))} → ${iso(dayAgo(signOffOffsets.at(-1)!))}`);
  console.log(`\nSign in as ${RECITER} and open /hifz — "Your revision" is now a full grid.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
