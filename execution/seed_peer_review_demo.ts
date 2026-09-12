/**
 * seed_peer_review_demo.ts — a realistic run of peer reviews so the reciter's
 * feedback view has something in it to look at.
 *
 * Bilal Osei reviews Adam Whitfield: four submitted sessions over the last
 * five weeks, twelve mistakes between them. The shape is deliberate, not
 * random — the feedback view only says anything interesting when mistakes
 * REPEAT, so the set is built to produce real patterns:
 *
 *   Tajweed — Qalqalah   3x across 2 surahs   (the standing problem)
 *   Tajweed — Ikhfa      2x across 2 surahs   (same rule, twice)
 *   Tajweed — Madd       2x
 *   Hifdh — Forgot it    2x, BOTH whole-ayah  (word_position null)
 *   Hifdh — Swapped / Iqlab / Makhraj of ق    1x each
 *
 * The oldest session is dated outside the 28-day window aggregatePatterns
 * treats as "recent", so the tracker shows total-vs-recent doing its job and
 * the heatmap shows a cold word beside hot ones. Session flags run
 * weak_hifz+halting → halting → none → strong, so the arc reads as improving.
 *
 * Two entries carry `pos: null` — a whole ayah, logged by tapping its end
 * marker, which is the commoner lapse. They stay ONE row each, so the
 * tracker counts one forgotten ayah once rather than once per word in it.
 *
 * Every word below is a real (surah, ayah, position) from quran_words and the
 * rule cited genuinely applies to it — e.g. ٱلْإِنسَـٰنَ is nūn sākinah before
 * sīn (ikhfa), حِلٌّۢ is tanwīn before bā (iqlab), يَلِدْ is dāl sākin
 * (qalqalah). Made-up data still has to be correct to be worth looking at.
 *
 * Run:    npx tsx execution/seed_peer_review_demo.ts
 * Clear:  npx tsx execution/seed_peer_review_demo.ts --clear
 * Idempotent: fixed session ids, so re-running replaces rather than piles up.
 * Demo tooling — it writes with the service role and bypasses RLS.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

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

// Fixed so a re-run overwrites its own rows instead of adding a second set.
const SESSION_IDS = [
  "d1a55100-0000-4000-8000-000000000001",
  "d1a55100-0000-4000-8000-000000000002",
  "d1a55100-0000-4000-8000-000000000003",
  "d1a55100-0000-4000-8000-000000000004",
];

type Seed = {
  daysAgo: number;
  flags: string[];
  note: string | null;
  mistakes: {
    surah: number; ayah: number; pos: number | null;   // null = the whole ayah
    category: "hifz" | "tajweed" | "makhraj";
    detail: string | null;
    word: string;   // for the log only — not stored
    note: string;
  }[];
};

const SEEDS: Seed[] = [
  {
    daysAgo: 33, // deliberately older than the 28-day "recent" window
    flags: ["weak_hifz", "halting"],
    note: "Ash-Shams fell apart from ayah 4 — worth another week on it before moving on.",
    mistakes: [
      { surah: 91, ayah: 4, pos: 1, category: "hifz", detail: "swapped", word: "وَٱلَّيْلِ",
        note: "Went into Ad-Duha's ayah — إِذَا سَجَىٰ instead of إِذَا يَغْشَىٰهَا." },
      { surah: 91, ayah: 1, pos: 2, category: "tajweed", detail: "madd", word: "وَضُحَىٰهَا",
        note: "Madd cut short, about one count." },
      { surah: 95, ayah: 4, pos: 3, category: "tajweed", detail: "ikhfa", word: "ٱلْإِنسَـٰنَ",
        note: "Nūn sākinah before sīn read clear — should be hidden." },
    ],
  },
  {
    daysAgo: 14,
    flags: ["halting"],
    note: "Al-Balad much steadier. Still stopping at the start of each new ayah.",
    mistakes: [
      { surah: 96, ayah: 2, pos: 2, category: "tajweed", detail: "ikhfa", word: "ٱلْإِنسَـٰنَ",
        note: "Same ikhfa as last time — نس." },
      { surah: 90, ayah: 2, pos: 2, category: "tajweed", detail: "iqlab", word: "حِلٌّۢ",
        note: "Tanwīn before bā — needs the mīm." },
      { surah: 96, ayah: 1, pos: null, category: "hifz", detail: "forgot", word: "Al-Alaq 1 (whole ayah)",
        note: "Blanked on the opening ayah — needed the first word prompting." },
    ],
  },
  {
    daysAgo: 6,
    flags: [],
    note: "Al-Ikhlas and At-Tin clean. Qalqalah is the thing to work on now.",
    mistakes: [
      { surah: 112, ayah: 3, pos: 2, category: "tajweed", detail: "qalqalah", word: "يَلِدْ",
        note: "No bounce on the dāl." },
      { surah: 112, ayah: 3, pos: 4, category: "tajweed", detail: "qalqalah", word: "يُولَدْ",
        note: "Same again on the stop." },
      { surah: 96, ayah: 1, pos: 1, category: "makhraj", detail: "ق", word: "ٱقْرَأْ",
        note: "Qāf coming forward, sounding closer to a kāf." },
    ],
  },
  {
    daysAgo: 2,
    flags: ["strong"],
    note: "Best run yet — straight through Ad-Duha and Ash-Shams with no prompting.",
    mistakes: [
      { surah: 95, ayah: 4, pos: 2, category: "tajweed", detail: "qalqalah", word: "خَلَقْنَا",
        note: "Qāf sākinah — the light bounce is still missing." },
      { surah: 93, ayah: 1, pos: 1, category: "tajweed", detail: "madd", word: "وَٱلضُّحَىٰ",
        note: "Held a touch long, closer to four counts." },
      { surah: 90, ayah: 3, pos: null, category: "hifz", detail: "forgot", word: "Al-Balad 3 (whole ayah)",
        note: "Skipped this ayah entirely and went to the next." },
    ],
  },
];

async function profileId(name: string): Promise<string> {
  const { data, error } = await db.from("profiles").select("id, full_name").eq("full_name", name);
  if (error) throw error;
  if (!data?.length) throw new Error(`No profile named "${name}" — is the demo seed applied?`);
  if (data.length > 1) throw new Error(`Several profiles named "${name}"; refusing to guess.`);
  return data[0].id;
}

async function clear() {
  // mistakes cascade off the session delete, but be explicit about it
  await db.from("revision_mistakes").delete().in("session_id", SESSION_IDS);
  const { error } = await db.from("revision_sessions").delete().in("id", SESSION_IDS);
  if (error) throw error;
  console.log(`cleared ${SESSION_IDS.length} demo sessions and their mistakes`);
}

async function main() {
  if (process.argv.includes("--clear")) return clear();

  const [reciter, reviewer] = await Promise.all([profileId(RECITER), profileId(REVIEWER)]);
  console.log(`reciter  ${RECITER}  ${reciter}`);
  console.log(`reviewer ${REVIEWER}  ${reviewer}`);

  // The reviewer may only open a session against an ACTIVE pair. Writing with
  // the service role skips that check, so assert it rather than sidestep it —
  // demo data that could not exist through the UI is not worth looking at.
  const { data: pair } = await db.from("revision_pairs").select("id")
    .eq("active", true)
    .or(`and(student_a.eq.${reviewer},student_b.eq.${reciter}),` +
        `and(student_a.eq.${reciter},student_b.eq.${reviewer})`);
  if (!pair?.length) {
    throw new Error(
      `No active revision pair between ${REVIEWER} and ${RECITER}. Assign them ` +
      `as partners in the teacher UI first — this script will not invent one.`,
    );
  }
  console.log(`pair     ${pair[0].id}\n`);

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  let total = 0;

  for (const [i, s] of SEEDS.entries()) {
    const id = SESSION_IDS[i];
    const at = new Date(now - s.daysAgo * day).toISOString();

    const { error: se } = await db.from("revision_sessions").upsert({
      id,
      reciter_id: reciter,
      reviewer_id: reviewer,
      started_at: at,
      submitted_at: at,          // submitted — a draft stays invisible to the reciter
      overall_note: s.note,
      flags: s.flags,
    });
    if (se) throw se;

    await db.from("revision_mistakes").delete().eq("session_id", id);
    const { error: me } = await db.from("revision_mistakes").insert(
      s.mistakes.map((m) => ({
        session_id: id,
        surah_number: m.surah, ayah_number: m.ayah, word_position: m.pos,  // null = whole ayah
        category: m.category, detail: m.detail, note: m.note,
        created_at: at,
      })),
    );
    if (me) throw me;

    total += s.mistakes.length;
    console.log(`  ${s.daysAgo.toString().padStart(2)}d ago  ${s.mistakes.length} mistakes  ` +
                `flags [${s.flags.join(", ") || "—"}]`);
    for (const m of s.mistakes) {
      console.log(`          ${m.word}  ${m.category}/${m.detail ?? "—"}` +
                  (m.pos === null ? "  [whole ayah]" : ""));
    }
  }

  console.log(`\n${SEEDS.length} submitted sessions, ${total} mistakes.`);
  console.log(`Sign in as ${RECITER} and open /hifz?tab=review to see the feedback.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
