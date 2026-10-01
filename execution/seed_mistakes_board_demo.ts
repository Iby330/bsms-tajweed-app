/**
 * seed_mistakes_board_demo.ts — teacher hearings and extra partner sessions
 * for Adam Whitfield, so the student Overview's mistakes board has a real
 * shape to show: recurring ayahs that come up in both sources, a spread of
 * tajweed rules, a handful of makhraj letters, and hearings mixed in among
 * partner sessions on the session chart.
 *
 * Teacher hearings are by Ibrahim Ramadan (the teacher who has heard demo
 * students before); partner sessions are by Bilal Osei, Adam's active
 * partner. Hearings only cover surahs Adam has already passed, so his
 * journey grid does not change colour. The existing peer-review demo
 * (seed_peer_review_demo.ts) is left alone and adds to the picture.
 *
 * Every mark lands on a real word where that mistake can happen: tajweed
 * rules and makhraj letters are matched against the word's Uthmani text
 * (a qalqalah letter with sukun, nun sakinah before an ikhfa letter, the
 * madd sign, a shaddah on nun or mim, and so on), not typed in by hand.
 *
 * Run:    cd web && npx tsx ../execution/seed_mistakes_board_demo.ts
 * Clear:  cd web && npx tsx ../execution/seed_mistakes_board_demo.ts --clear
 * Idempotent: fixed session ids, so a re-run replaces its own rows.
 * Demo tooling: it writes with the service role and bypasses RLS.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const env: Record<string, string> = {};
for (const line of readFileSync(join(here, "..", "web/.env.local"), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const RECITER = "Adam Whitfield";
const TEACHER = "Ibrahim Ramadan";
const PARTNER = "Bilal Osei";

const sid = (n: number) => `d1a55300-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

type Cat = "hifz" | "tajweed" | "makhraj";
/** A mark: hifdh slips name their word (pos null = the whole ayah);
 *  tajweed and makhraj name a rule or letter and the nth matching word in
 *  the surah (from `ayah` on, when given) is found for them. */
type MarkSpec =
  | { cat: "hifz"; detail: "forgot" | "swapped" | "added"; surah: number; ayah: number; pos: number | null }
  | { cat: "tajweed"; detail: string; surah: number; ayah?: number; nth?: number }
  | { cat: "makhraj"; detail: string; surah: number; ayah?: number; nth?: number };

type SessionSpec = {
  n: number;
  kind: "hearing" | "peer";
  daysAgo: number;
  range?: [number, number];        // hearing: from (higher) → to (lower)
  note: string;
  marks: MarkSpec[];
};

const SESSIONS: SessionSpec[] = [
  // ——— teacher hearings, oldest first
  { n: 1, kind: "hearing", daysAgo: 40, range: [100, 96], note: "Solid overall. Watch the qalqalah on the stops.",
    marks: [
      { cat: "tajweed", detail: "qalqalah", surah: 96 },
      { cat: "tajweed", detail: "ikhfa", surah: 98 },
      { cat: "makhraj", detail: "ق", surah: 97 },
      { cat: "hifz", detail: "swapped", surah: 98, ayah: 5, pos: 3 },
    ] },
  { n: 2, kind: "hearing", daysAgo: 33, range: [95, 91], note: "Ash-Shams needs another week. Madd lengths drifting.",
    marks: [
      { cat: "tajweed", detail: "madd", surah: 93 },
      { cat: "tajweed", detail: "madd", surah: 93, nth: 2 },
      { cat: "makhraj", detail: "ض", surah: 93 },
      { cat: "hifz", detail: "forgot", surah: 91, ayah: 9, pos: null },
      { cat: "tajweed", detail: "ghunnah", surah: 92 },
    ] },
  { n: 3, kind: "hearing", daysAgo: 26, range: [93, 89], note: "Al-Fajr from ayah 21 is the weak part.",
    marks: [
      { cat: "hifz", detail: "forgot", surah: 89, ayah: 23, pos: 2 },
      { cat: "hifz", detail: "swapped", surah: 89, ayah: 22, pos: 3 },
      { cat: "tajweed", detail: "qalqalah", surah: 89 },
      { cat: "tajweed", detail: "ikhfa", surah: 90 },
      { cat: "makhraj", detail: "ع", surah: 90 },
    ] },
  { n: 4, kind: "hearing", daysAgo: 19, range: [92, 89], note: "Better. Iqlab still missed in Al-Fajr.",
    marks: [
      { cat: "tajweed", detail: "iqlab", surah: 89, ayah: 23 },
      { cat: "tajweed", detail: "idgham", surah: 92 },
      { cat: "tajweed", detail: "ghunnah", surah: 91 },
      { cat: "makhraj", detail: "ض", surah: 89 },
    ] },
  { n: 5, kind: "hearing", daysAgo: 12, range: [91, 89], note: "Al-Balad 13 to 16 mixed up again.",
    marks: [
      { cat: "hifz", detail: "forgot", surah: 89, ayah: 23, pos: 2 },
      { cat: "hifz", detail: "swapped", surah: 90, ayah: 14, pos: 2 },
      { cat: "tajweed", detail: "qalqalah", surah: 89, nth: 2 },
      { cat: "tajweed", detail: "tafkhim", surah: 90 },
    ] },
  { n: 6, kind: "hearing", daysAgo: 5, range: [90, 89], note: "Fluent. Keep revising Al-Fajr 21 to 24.",
    marks: [
      { cat: "hifz", detail: "swapped", surah: 90, ayah: 14, pos: 2 },
      { cat: "tajweed", detail: "ikhfa", surah: 89 },
      { cat: "makhraj", detail: "ح", surah: 89 },
    ] },

  // ——— partner revision with Bilal
  { n: 11, kind: "peer", daysAgo: 29, note: "Al-Ghashiyah opening is fine.",
    marks: [
      { cat: "tajweed", detail: "madd", surah: 88 },
      { cat: "tajweed", detail: "ghunnah", surah: 88 },
    ] },
  { n: 12, kind: "peer", daysAgo: 21, note: "Got stuck in Al-Fajr near the end.",
    marks: [
      { cat: "hifz", detail: "forgot", surah: 89, ayah: 23, pos: 2 },
      { cat: "tajweed", detail: "qalqalah", surah: 89, nth: 3 },
      { cat: "makhraj", detail: "ض", surah: 88 },
    ] },
  { n: 13, kind: "peer", daysAgo: 14, note: "Al-Balad mixed up in the middle.",
    marks: [
      { cat: "hifz", detail: "swapped", surah: 90, ayah: 14, pos: 2 },
      { cat: "hifz", detail: "added", surah: 90, ayah: 16, pos: 1 },
      { cat: "tajweed", detail: "izhar", surah: 96 },
    ] },
  { n: 14, kind: "peer", daysAgo: 8, note: "Al-Ghashiyah 17 onwards was shaky.",
    marks: [
      { cat: "hifz", detail: "forgot", surah: 88, ayah: 17, pos: 4 },
      { cat: "tajweed", detail: "madd", surah: 88, ayah: 17 },
      { cat: "tajweed", detail: "ikhfa", surah: 88 },
    ] },
  { n: 15, kind: "peer", daysAgo: 3, note: "Good session.",
    marks: [
      { cat: "hifz", detail: "forgot", surah: 88, ayah: 17, pos: 4 },
      { cat: "makhraj", detail: "ط", surah: 88 },
    ] },
  { n: 16, kind: "peer", daysAgo: 1, note: "Clean run through Al-Fajr.", marks: [] },
];

const NOTES: Record<string, string> = {
  forgot: "Needed prompting here.",
  swapped: "Went into a similar ayah.",
  added: "Added a word that is not there.",
  qalqalah: "No bounce on the stop.",
  ikhfa: "Nun read clearly; it should be hidden.",
  idgham: "Should merge into the next word.",
  iqlab: "Needs the mim sound before the ba.",
  izhar: "Nun should be clear before a throat letter.",
  madd: "Madd cut short.",
  ghunnah: "Ghunnah too short.",
  tafkhim: "Read light; this letter is heavy.",
};

// ——— word matching

type Word = { surah_number: number; ayah_number: number; word_position: number; text_uthmani: string; is_end: boolean };

const SUKUN = "ْ";
const SHADDA = "ّ";
const TANWEEN = /[ًٌٍ]/;
const strip = (t: string) => t.replace(/[^ء-يٱ]/g, "");   // base letters only
const firstLetter = (t: string) => strip(t).replace(/^ٱ/, "ا")[0] ?? "";
const endsSakinOrTanween = (t: string) => {
  const s = t.replace(/[\sۖ-ۜ]+$/, "");          // drop pause marks
  return TANWEEN.test(s.slice(-3)) || new RegExp(`ن${SUKUN}?$`).test(s.replace(/[ۭۢ]/g, ""));
};

const RULES: Record<string, (w: Word, next: Word | undefined) => boolean> = {
  qalqalah: (w) => new RegExp(`[قطبجد]${SUKUN}`).test(w.text_uthmani),
  ikhfa: (w) => /ن[تثجدذزسشصضطظفقك]/.test(w.text_uthmani),
  izhar: (w) => new RegExp(`ن${SUKUN}[ءأإهعحغخ]`).test(w.text_uthmani),
  madd: (w) => /ٓ/.test(w.text_uthmani),
  ghunnah: (w) => new RegExp(`[نم][\\u064E\\u064F\\u0650]?${SHADDA}`).test(w.text_uthmani),
  tafkhim: (w) => /[صضطظ]/.test(w.text_uthmani),
  iqlab: (w, next) => /[ۭۢ]/.test(w.text_uthmani) && !!next && firstLetter(next.text_uthmani) === "ب",
  idgham: (w, next) => endsSakinOrTanween(w.text_uthmani) && !!next && /[يرملون]/.test(firstLetter(next.text_uthmani)),
};

const surahCache = new Map<number, Word[]>();
async function wordsOf(surah: number): Promise<Word[]> {
  if (!surahCache.has(surah)) {
    const { data, error } = await db.from("quran_words")
      .select("surah_number, ayah_number, word_position, text_uthmani, is_end")
      .eq("surah_number", surah).order("ayah_number").order("word_position");
    if (error) throw error;
    surahCache.set(surah, (data ?? []) as Word[]);
  }
  return surahCache.get(surah)!;
}

async function place(m: MarkSpec): Promise<{ ayah: number; pos: number | null; word: string }> {
  const words = await wordsOf(m.surah);
  if (m.cat === "hifz") {
    const w = words.find((x) => x.ayah_number === m.ayah && x.word_position === m.pos);
    if (m.pos !== null && !w) throw new Error(`No word ${m.surah}:${m.ayah}:${m.pos}`);
    return { ayah: m.ayah, pos: m.pos, word: w?.text_uthmani ?? `${m.surah}:${m.ayah} (whole ayah)` };
  }
  const text = words.filter((w) => !w.is_end);
  const test = m.cat === "makhraj"
    ? (w: Word) => strip(w.text_uthmani).includes(m.detail)
    : (w: Word, next: Word | undefined) => RULES[m.detail](w, next);
  const hits = text.filter((w, i) => {
    if (m.ayah !== undefined && w.ayah_number < m.ayah) return false;
    const next = text[i + 1]?.ayah_number === w.ayah_number ? text[i + 1] : undefined;
    return test(w, next);
  });
  const hit = hits[Math.min((m.nth ?? 1) - 1, hits.length - 1)];
  if (!hit) throw new Error(`No word in surah ${m.surah} fits ${m.cat}/${m.detail}`);
  return { ayah: hit.ayah_number, pos: hit.word_position, word: hit.text_uthmani };
}

// ——— run

async function profileId(name: string, role = "student"): Promise<string> {
  // A name is not unique (the teacher has student and admin profiles too),
  // so the role narrows it.
  const { data, error } = await db.from("profiles").select("id").eq("full_name", name).eq("role", role);
  if (error) throw error;
  if (!data?.length) throw new Error(`No ${role} named "${name}"`);
  if (data.length === 1) return data[0].id;
  // Still ambiguous (two teacher accounts share the name): take the one
  // who has already heard students, and refuse to guess between several.
  const { data: heard } = await db.from("revision_sessions").select("reviewer_id")
    .eq("kind", "hearing").in("reviewer_id", data.map((d) => d.id));
  const ids = [...new Set((heard ?? []).map((h) => h.reviewer_id))];
  if (ids.length !== 1) throw new Error(`${data.length} ${role}s named "${name}" and no single one has heard students`);
  return ids[0];
}

async function clear() {
  const ids = SESSIONS.map((s) => sid(s.n));
  await db.from("revision_mistakes").delete().in("session_id", ids);
  const { error } = await db.from("revision_sessions").delete().in("id", ids);
  if (error) throw error;
  console.log(`cleared ${ids.length} demo sessions and their mistakes`);
}

async function main() {
  if (process.argv.includes("--clear")) return clear();
  const [reciter, teacher, partner] = await Promise.all([
    profileId(RECITER), profileId(TEACHER, "teacher"), profileId(PARTNER),
  ]);

  const { data: passed } = await db.from("hifz_records").select("surah_number").eq("student_id", reciter);
  const passedSet = new Set((passed ?? []).map((r) => r.surah_number));

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  let total = 0;
  for (const s of SESSIONS) {
    if (s.range) {
      for (let n = s.range[0]; n >= s.range[1]; n--) {
        if (!passedSet.has(n)) throw new Error(`Hearing ${s.n} covers surah ${n}, which ${RECITER} has not passed`);
      }
    }
    const id = sid(s.n);
    const at = new Date(now - s.daysAgo * day + 17 * 60 * 60 * 1000 - (now % day)).toISOString();
    const { error: se } = await db.from("revision_sessions").upsert({
      id,
      reciter_id: reciter,
      reviewer_id: s.kind === "hearing" ? teacher : partner,
      kind: s.kind,
      surah_number: s.range?.[0] ?? null,
      to_surah_number: s.range?.[1] ?? null,
      started_at: at,
      submitted_at: at,
      overall_note: s.note,
      flags: [],
    });
    if (se) throw se;

    await db.from("revision_mistakes").delete().eq("session_id", id);
    const rows = [];
    for (const m of s.marks) {
      const p = await place(m);
      rows.push({
        session_id: id, surah_number: m.surah, ayah_number: p.ayah, word_position: p.pos,
        category: m.cat, detail: m.detail, note: NOTES[m.detail] ?? null, created_at: at,
      });
      console.log(`    ${m.surah}:${p.ayah}${p.pos === null ? "" : `:${p.pos}`}  ${p.word}  ${m.cat}/${m.detail}`);
    }
    if (rows.length) {
      const { error: me } = await db.from("revision_mistakes").insert(rows);
      if (me) throw me;
    }
    total += rows.length;
    console.log(`  ${s.kind.padEnd(7)} ${String(s.daysAgo).padStart(2)}d ago  ${rows.length} marks${s.range ? `  ${s.range[0]}→${s.range[1]}` : ""}`);
  }
  console.log(`\n${SESSIONS.length} sessions, ${total} marks. Sign in as ${RECITER} and open /hifdh.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
