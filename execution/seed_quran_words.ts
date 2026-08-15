/**
 * seed_quran_words.ts — import word-by-word Uthmani text with Madani mushaf
 * page/line layout from the quran.com v4 API into `quran_words`.
 *
 * Scope: chapters 72..114 — the BSMS memorisation run (An-Nas ← Al-Jinn),
 * matching the `surahs` table the FK points at.
 * Run:  npx tsx execution/seed_quran_words.ts
 * Idempotent: upserts on (surah_number, ayah_number, word_position).
 * One-off operational tooling — production NEVER calls quran.com.
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

const API = "https://api.quran.com/api/v4/verses/by_chapter";

type ApiWord = {
  position: number;
  char_type_name: string; // "word" | "end"
  text_uthmani: string;
  page_number: number;
  line_number: number;
};
type ApiVerse = { verse_number: number; words: ApiWord[] };

async function fetchChapter(n: number): Promise<ApiVerse[]> {
  const verses: ApiVerse[] = [];
  for (let page = 1; ; page++) {
    const url =
      `${API}/${n}?words=true&word_fields=text_uthmani,page_number,line_number,char_type_name` +
      `&per_page=50&page=${page}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`chapter ${n} page ${page}: HTTP ${res.status}`);
    const json = (await res.json()) as {
      verses: ApiVerse[];
      pagination: { next_page: number | null };
    };
    verses.push(...json.verses);
    if (!json.pagination.next_page) break;
  }
  return verses;
}

async function main() {
  const rows: Record<string, unknown>[] = [];
  for (let n = 72; n <= 114; n++) {
    const verses = await fetchChapter(n);
    for (const v of verses) {
      for (const w of v.words) {
        if (!w.text_uthmani || !w.page_number || !w.line_number)
          throw new Error(
            `chapter ${n} ayah ${v.verse_number}: incomplete word ${JSON.stringify(w)}`,
          );
        rows.push({
          surah_number: n,
          ayah_number: v.verse_number,
          word_position: w.position,
          text_uthmani: w.text_uthmani,
          is_end: w.char_type_name === "end",
          page_number: w.page_number,
          line_number: w.line_number,
        });
      }
    }
    console.log(`chapter ${n}: ${verses.length} ayahs`);
  }
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await db.from("quran_words").upsert(rows.slice(i, i + 1000));
    if (error) throw new Error(`upsert batch at ${i}: ${error.message}`);
  }
  console.log(`seeded ${rows.length} words across chapters 72–114`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
