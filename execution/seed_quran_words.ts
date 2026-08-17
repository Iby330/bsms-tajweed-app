/**
 * seed_quran_words.ts — import word-by-word Uthmani text with Madani mushaf
 * page/line layout from the quran.com v4 API into `quran_words`.
 *
 * Scope: chapters 67..114 — the BSMS content range (An-Nas ← Al-Mulk). The
 * memorisation run in `surahs` currently ends at Al-Jinn (72); the text is
 * seeded past it (migration 0014 dropped the FK) so extending the run never
 * has to wait on a reseed.
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

const API = "https://api.quran.com/api/v4/verses/by_page";
const FIRST_PAGE = 562; // Al-Mulk opens juz 29
const LAST_PAGE = 604;

type ApiWord = {
  position: number;
  char_type_name: string; // "word" | "end"
  text_uthmani: string;
  code_v1: string; // glyph in the page's QCF v1 font (1405H print)
  code_v2: string; // glyph in the page's QCF v2 font (1421H print)
  line_number: number;
};
type ApiVerse = { verse_key: string; words: ApiWord[] };

/** By PAGE, not by chapter: a verse that straddles a page boundary carries
 *  its verse-level page on every word in the by_chapter feed, which files
 *  the spill-over words under the wrong page (seen: 79:16 stamped p583,
 *  printed on p584 line 1). The by_page feed is the page's actual
 *  composition — the same source quran.com's own mushaf mode renders. */
async function fetchPage(p: number): Promise<ApiVerse[]> {
  const verses: ApiVerse[] = [];
  for (let page = 1; ; page++) {
    const url =
      `${API}/${p}?words=true&word_fields=text_uthmani,code_v1,code_v2,line_number,char_type_name` +
      `&per_page=50&page=${page}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`mushaf page ${p} (request page ${page}): HTTP ${res.status}`);
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
  for (let p = FIRST_PAGE; p <= LAST_PAGE; p++) {
    const verses = await fetchPage(p);
    for (const v of verses) {
      const [surah, ayah] = v.verse_key.split(":").map(Number);
      if (!surah || !ayah) throw new Error(`page ${p}: bad verse_key ${v.verse_key}`);
      for (const w of v.words) {
        if (!w.text_uthmani || !w.line_number)
          throw new Error(`page ${p} verse ${v.verse_key}: incomplete word ${JSON.stringify(w)}`);
        rows.push({
          surah_number: surah,
          ayah_number: ayah,
          word_position: w.position,
          text_uthmani: w.text_uthmani,
          code_v1: w.code_v1 ?? null,
          code_v2: w.code_v2 ?? null,
          is_end: w.char_type_name === "end",
          page_number: p,
          line_number: w.line_number,
        });
      }
    }
    console.log(`page ${p}: ${verses.length} verses`);
  }
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await db.from("quran_words").upsert(rows.slice(i, i + 1000));
    if (error) throw new Error(`upsert batch at ${i}: ${error.message}`);
  }
  console.log(`seeded ${rows.length} words across chapters 67–114`);

  await fetchPageFonts(rows);
}

/** Per-page fonts for every page the seed touched. V2 (1421H, what the
 *  reader renders) comes from QUL's CDN into web/public/fonts/qcf2/;
 *  V1 (1405H, kept as fallback data) from the nuqayah mirror into
 *  web/public/fonts/qcf/. Skips files already present. */
const V1_BASE = "https://raw.githubusercontent.com/nuqayah/qpc-fonts/master/mushaf-woff2";
const V2_BASE = "https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/v2/woff2";

async function fetchPageFonts(rows: Record<string, unknown>[]) {
  const { mkdirSync, existsSync, writeFileSync } = await import("node:fs");
  const pages = [...new Set(rows.map((r) => r.page_number as number))].sort((a, b) => a - b);
  for (const [dirName, base, name] of [
    ["web/public/fonts/qcf2", V2_BASE, (p: number) => `p${p}.woff2`],
    ["web/public/fonts/qcf", V1_BASE, (p: number) => `QCF_P${String(p).padStart(3, "0")}.woff2`],
  ] as const) {
    const dir = join(repoRoot, dirName);
    mkdirSync(dir, { recursive: true });
    let fetched = 0;
    for (const p of pages) {
      const dest = join(dir, name(p));
      if (existsSync(dest)) continue;
      const res = await fetch(`${base}/${name(p)}`);
      if (!res.ok) throw new Error(`${dirName}/${name(p)}: HTTP ${res.status}`);
      writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
      fetched++;
    }
    console.log(`${dirName}: ${pages.length} needed, ${fetched} downloaded`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
