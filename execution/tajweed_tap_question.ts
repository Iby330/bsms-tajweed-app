/**
 * tajweed_tap_question.ts — build a "tap the rule" question from real tajweed
 * annotations, and put it on a homework.
 *
 * Run:  cd web && npx tsx ../execution/tajweed_tap_question.ts            # dry run
 *       cd web && npx tsx ../execution/tajweed_tap_question.ts --commit   # write it
 *       cd web && npx tsx ../execution/tajweed_tap_question.ts --delete   # take it back off
 *
 * The answer key is DERIVED, never typed. Which words carry ikhfā' is a claim
 * about the Qur'an, so it comes from a sourced dataset rather than from
 * whoever wrote the question: cpfair/quran-tajweed, CC-BY 4.0, generated from
 * the Tanzil Uthmani text.
 *
 * How the mapping works, and why it is safe
 * ----------------------------------------
 * The annotations give a rule name and a [start, end) range of Unicode
 * CODEPOINT offsets within one ayah of Tanzil's Uthmani text. Our own
 * `quran_words.text_uthmani` came from quran.com, which is the same Uthmani
 * text word by word — so joining our words with single spaces reproduces
 * Tanzil's string, and the offsets land where they should. Verified for every
 * ayah in range by ALIGNMENT_GUARD below: if any annotation reaches past the
 * end of our reconstruction, the texts have drifted apart and the run aborts
 * rather than keying the question off a guess.
 *
 * Two details that are easy to get wrong:
 *
 *   · The first ayah of a surah carries the basmala in Tanzil's text, so every
 *     offset in it is shifted by the basmala's length plus a space.
 *   · A rule routinely SPANS TWO WORDS — ikhfā' is a tanwīn at the end of one
 *     word meeting an ikhfā' letter at the start of the next (سَبْعًۭا شِدَادًۭا).
 *     Both words are marked correct, because that is where the rule lives; the
 *     prompt says so, so a student is not guessing at the convention.
 *
 * Spike shape: the question is a `checkbox` whose options are the words of the
 * passage, so it needs no schema change and rides the existing scoring path
 * (`per_option`: each correct word earns a share, wrong picks cancel, floored
 * at zero). If this graduates from a test, `qtype` should gain a real
 * `tap_words` value — deliberately not done yet, because Postgres cannot drop
 * an enum value once added and this question is meant to be deletable.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const requireFromWeb = createRequire(join(repoRoot, "web/package.json"));
const { createClient } = requireFromWeb("@supabase/supabase-js");

/* ── what to build ───────────────────────────────────────────────────── */

/**
 * Every knob is a flag, so building the next one is a command rather than an
 * edit. The four that matter are the ones a teacher actually decides: which
 * rule to spot, which passage to spot it in, what the question says, and what
 * it is worth.
 */
const arg = (name: string, fallback?: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  const value = i >= 0 ? process.argv[i + 1] : undefined;
  if (value === undefined || value.startsWith("--")) {
    if (fallback !== undefined) return fallback;
    throw new Error(`missing --${name}`);
  }
  return value;
};

const COMMIT = process.argv.includes("--commit");
const DELETE = process.argv.includes("--delete");
const HELP = process.argv.includes("--help") || process.argv.includes("-h");

const HOMEWORK_NUMBER = Number(arg("homework", "107"));
const SURAH = Number(arg("surah", "78"));
const FROM_AYAH = Number(arg("from", "12"));
const TO_AYAH = Number(arg("to", "18"));
const RULE = arg("rule", "ikhfa");
const POINTS = Number(arg("points", "4"));
/** Last on the paper by default, so it never renumbers the real questions. */
const POSITION = Number(arg("position", "99"));

/** The 18 rules the annotation set knows, and what each one is called here. */
const RULES: Record<string, string> = {
  ikhfa: "ikhfā’",
  ikhfa_shafawi: "ikhfā’ shafawī",
  idghaam_ghunnah: "idghām with ghunna",
  idghaam_no_ghunnah: "idghām without ghunna",
  idghaam_shafawi: "idghām shafawī",
  idghaam_mutajaanisain: "idghām mutajānisayn",
  idghaam_mutaqaaribain: "idghām mutaqāribayn",
  iqlab: "iqlāb",
  ghunnah: "ghunna",
  qalqalah: "qalqala",
  madd_2: "madd of 2 ḥarakāt",
  madd_246: "madd of 2, 4 or 6 ḥarakāt",
  madd_muttasil: "madd muttaṣil",
  madd_munfasil: "madd munfaṣil",
  madd_6: "madd of 6 ḥarakāt",
  hamzat_wasl: "hamzat al-waṣl",
  lam_shamsiyyah: "lām shamsiyya",
  silent: "a silent letter",
};

/**
 * Said in the question when nothing better is given. It has to state the
 * both-words convention: a rule routinely sits across a word boundary, and a
 * student who does not know that is being marked on a convention rather than
 * on tajweed.
 */
const defaultPrompt = () =>
  `Tap every word where ${RULES[RULE] ?? RULE} happens in this passage ` +
  `(${SURAH}:${FROM_AYAH}–${TO_AYAH}). When the rule sits across two words, ` +
  `tap BOTH of them.`;

const PROMPT = arg("prompt", defaultPrompt());

const SOURCE =
  "https://raw.githubusercontent.com/cpfair/quran-tajweed/master/output/tajweed.hafs.uthmani-pause-sajdah.json";

/** Tanzil prefixes the first ayah of a surah with the basmala. */
const BASMALA = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ";

if (HELP) {
  console.log(`
Build a "tap the rule" question from sourced tajweed annotations.

  --homework N   homework NUMBER to attach to        (default 107)
  --surah N      surah                               (default 78)
  --from N       first ayah                          (default 12)
  --to N         last ayah                           (default 18)
  --rule NAME    one of: ${Object.keys(RULES).join(", ")}
  --points N     marks for the question              (default 4)
  --position N   position on the paper               (default 99)
  --prompt "…"   the question text                   (default: generated)
  --commit       write it (otherwise a dry run)
  --delete       remove the question at --position from --homework

Dry run prints the passage with the key marked, so the wording and the key can
be checked before anything is written.
`);
  process.exit(0);
}

/* ── setup ───────────────────────────────────────────────────────────── */

const env: Record<string, string> = {};
for (const line of readFileSync(join(repoRoot, "web/.env.local"), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type Annotation = { rule: string; start: number; end: number };
type Record_ = { surah: number; ayah: number; annotations: Annotation[] };
type Word = {
  ayah_number: number;
  word_position: number;
  text_uthmani: string;
  is_end: boolean;
  /** The printed word as a single KFGQPC glyph, page-font specific. */
  code_v1: string | null;
  page_number: number;
};

/** Cached in the temp dir: 5MB, unchanging, and not ours to vendor. */
async function annotations(): Promise<Record_[]> {
  const cache = join(tmpdir(), "bsms-tajweed", "tajweed.hafs.json");
  if (!existsSync(cache)) {
    mkdirSync(dirname(cache), { recursive: true });
    process.stdout.write("downloading tajweed annotations… ");
    const res = await fetch(SOURCE);
    if (!res.ok) throw new Error(`annotation download failed: ${res.status}`);
    writeFileSync(cache, await res.text());
    console.log("done");
  }
  return JSON.parse(readFileSync(cache, "utf8")) as Record_[];
}

/* ── the mapping ─────────────────────────────────────────────────────── */

export type Tapword = {
  ayah: number;
  position: number;
  text: string;
  glyph: string | null;
  page: number;
  correct: boolean;
};

/**
 * Words of the passage in reading order, each flagged with whether the rule
 * touches it. Throws when the annotation offsets do not fit our text — see the
 * alignment note at the top.
 */
export function mapRule(
  words: Word[],
  records: Record_[],
  rule: string,
): { passage: Tapword[]; instances: number } {
  const byAyah = new Map<number, Word[]>();
  for (const w of words) {
    if (w.is_end) continue; // the ayah-number glyph is not a word to tap
    const list = byAyah.get(w.ayah_number) ?? [];
    list.push(w);
    byAyah.set(w.ayah_number, list);
  }

  const passage: Tapword[] = [];
  let instances = 0;

  for (const ayah of [...byAyah.keys()].sort((a, b) => a - b)) {
    const ws = [...byAyah.get(ayah)!].sort((a, b) => a.word_position - b.word_position);

    // Rebuild Tanzil's string for this ayah and remember where each word sits.
    const prefix = ayah === 1 ? [...BASMALA].length + 1 : 0;
    let cursor = prefix;
    const spans = ws.map((w) => {
      const start = cursor;
      const end = start + [...w.text_uthmani].length;
      cursor = end + 1; // the space between words
      return { word: w, start, end };
    });
    const textEnd = spans.length ? spans[spans.length - 1].end : prefix;

    const record = records.find((r) => r.surah === SURAH && r.ayah === ayah);
    const anns = record?.annotations ?? [];

    // ALIGNMENT_GUARD — the whole method rests on our text matching Tanzil's.
    for (const a of anns) {
      if (a.end > textEnd) {
        throw new Error(
          `${SURAH}:${ayah} — annotation ${a.rule} [${a.start},${a.end}) runs past ` +
            `our text (${textEnd} codepoints). The two texts have drifted; do not ` +
            `trust the key.`,
        );
      }
    }

    const hits = anns.filter((a) => a.rule === rule);
    instances += hits.length;
    const marked = new Set<number>();
    for (const a of hits) {
      for (const s of spans) {
        if (a.start < s.end && a.end > s.start) marked.add(s.word.word_position);
      }
    }

    for (const s of spans) {
      passage.push({
        ayah,
        position: s.word.word_position,
        text: s.word.text_uthmani,
        glyph: s.word.code_v1,
        page: s.word.page_number,
        correct: marked.has(s.word.word_position),
      });
    }
  }

  return { passage, instances };
}

/* ── run ─────────────────────────────────────────────────────────────── */

async function main() {

  const { data: hw } = await db
    .from("homeworks")
    .select("id, number, title, total_marks, is_graded")
    .eq("number", HOMEWORK_NUMBER)
    .maybeSingle();
  if (!hw) throw new Error(`no homework numbered ${HOMEWORK_NUMBER}`);

  if (DELETE) {
    const { data: gone, error } = await db
      .from("questions")
      .delete()
      .eq("homework_id", hw.id)
      .eq("position", POSITION)
      .select("id");
    if (error) throw error;
    console.log(`deleted ${gone?.length ?? 0} question(s) from ${hw.title}`);
    process.exit(0);
  }

  const { data: words, error: wordErr } = await db
    .from("quran_words")
    .select("ayah_number, word_position, text_uthmani, is_end, code_v1, page_number")
    .eq("surah_number", SURAH)
    .gte("ayah_number", FROM_AYAH)
    .lte("ayah_number", TO_AYAH)
    .order("ayah_number")
    .order("word_position");
  if (wordErr) throw wordErr;
  if (!words?.length) throw new Error(`no words seeded for ${SURAH}:${FROM_AYAH}-${TO_AYAH}`);

  const { passage, instances } = mapRule(words as Word[], await annotations(), RULE);

  // The label carries the page as well as the locator, because the page names
  // the glyph font; the value carries the glyph AND the readable text, because
  // the student RPC passes only these three fields through.
  const options = passage.map((w, i) => ({
    position: i + 1,
    label: `${SURAH}:${w.ayah}:${w.position}:${w.page}`,
    value: w.glyph ? `${w.glyph}\t${w.text}` : w.text,
    correct: w.correct,
  }));

  const unprinted = passage.filter((w) => !w.glyph);
  if (unprinted.length) {
    console.warn(
      `warning: ${unprinted.length} of ${passage.length} words have no printed glyph ` +
        `and will fall back to Amiri, which renders the Madani marks poorly.`,
    );
  }
  const key = options.filter((o) => o.correct);

  console.log(`\n${hw.title} — ${SURAH}:${FROM_AYAH}-${TO_AYAH}, rule "${RULE}"`);
  console.log(`${options.length} words · ${instances} instances · ${key.length} words in the key\n`);
  let ayah = 0;
  for (const w of passage) {
    if (w.ayah !== ayah) {
      ayah = w.ayah;
      process.stdout.write(`\n  ${SURAH}:${ayah}  `);
    }
    process.stdout.write(w.correct ? `[${w.text}]✓ ` : `${w.text} `);
  }
  console.log("\n");

  if (!COMMIT) {
    console.log("dry run — nothing written. Pass --commit to add it, --delete to remove it.");
    process.exit(0);
  }

  const { data: existing } = await db
    .from("questions")
    .select("id")
    .eq("homework_id", hw.id)
    .eq("position", POSITION)
    .maybeSingle();

  const row = {
    homework_id: hw.id,
    position: POSITION,
    qtype: "checkbox" as const,
    scoring: "per_option" as const,
    prompt: PROMPT,
    points: POINTS,
    is_bonus: false,
    is_task: false,
    needs_key: false,
    options,
    rubric: null,
  };

  if (existing) {
    const { error } = await db.from("questions").update(row).eq("id", existing.id);
    if (error) throw error;
    console.log(`updated question ${existing.id}`);
  } else {
    const { data: made, error } = await db.from("questions").insert(row).select("id").single();
    if (error) throw error;
    console.log(`created question ${made.id}`);
  }
  console.log(`on ${hw.title} (homework ${hw.number}) — ungraded, ${POINTS} marks, position ${POSITION}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
