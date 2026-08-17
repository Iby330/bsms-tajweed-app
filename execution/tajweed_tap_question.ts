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

const HOMEWORK_NUMBER = 107; // TFP 7 — no submissions, ungraded: a safe sandbox
const SURAH = 78; // An-Naba'
const FROM_AYAH = 12;
const TO_AYAH = 18;
const RULE = "ikhfa";
const POINTS = 4;
const POSITION = 99; // last on the paper, so it never renumbers the real questions

const PROMPT =
  "Tap every word where ikhfā’ happens in this passage (An-Naba’ 12–18). " +
  "Ikhfā’ sits where a nūn sākin or tanwīn meets one of its fifteen letters — " +
  "so when the two are in different words, tap BOTH of them.";

const SOURCE =
  "https://raw.githubusercontent.com/cpfair/quran-tajweed/master/output/tajweed.hafs.uthmani-pause-sajdah.json";

/** Tanzil prefixes the first ayah of a surah with the basmala. */
const BASMALA = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ";

/* ── setup ───────────────────────────────────────────────────────────── */

const env: Record<string, string> = {};
for (const line of readFileSync(join(repoRoot, "web/.env.local"), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const COMMIT = process.argv.includes("--commit");
const DELETE = process.argv.includes("--delete");

type Annotation = { rule: string; start: number; end: number };
type Record_ = { surah: number; ayah: number; annotations: Annotation[] };
type Word = {
  ayah_number: number;
  word_position: number;
  text_uthmani: string;
  is_end: boolean;
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
    .select("ayah_number, word_position, text_uthmani, is_end")
    .eq("surah_number", SURAH)
    .gte("ayah_number", FROM_AYAH)
    .lte("ayah_number", TO_AYAH)
    .order("ayah_number")
    .order("word_position");
  if (wordErr) throw wordErr;
  if (!words?.length) throw new Error(`no words seeded for ${SURAH}:${FROM_AYAH}-${TO_AYAH}`);

  const { passage, instances } = mapRule(words as Word[], await annotations(), RULE);

  const options = passage.map((w, i) => ({
    position: i + 1,
    label: `${SURAH}:${w.ayah}:${w.position}`,
    value: w.text,
    correct: w.correct,
  }));
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
