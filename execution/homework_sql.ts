/**
 * homework_sql.ts — turn a bundle of finished homework papers into ONE
 * reviewable, idempotent SQL migration that loads them.
 *
 *   cd web && npx tsx ../execution/homework_sql.ts \
 *       ../docs/homework-2026-27/final/term1-week1.json \
 *       supabase/migrations/0047_homework_term1_week1.sql
 *
 * Then review the file and apply it with execution/apply_migration.ts, which
 * sends it as one batch and records it in schema_migrations.
 *
 * Why SQL and not inserts from here: the load replaces papers students may
 * already have touched, so it must land whole or not at all, and the 2026/27
 * paper set should be on record next to the schema (as 0003 was for last
 * year). This script only READS the database (for mushaf glyphs).
 *
 * The bundle is the drafts' own format (docs/homework-2026-27): per paper a
 * number, series, course key, ordinal, term-1 week (for a NEW row only) and
 * questions in the review formats. How each format lands:
 *
 *   mcq / true_false / odd_one_out / count → qtype mcq, scoring exact
 *   select_all                             → checkbox, exact (all or nothing, 0025)
 *   tap                                    → checkbox, per_option, one option per
 *                                            mushaf word (label surah:ayah:pos:page,
 *                                            value glyph\ttext) — the TapWords shape
 *   short / extended                       → text / paragraph, exact, rubric
 *   voice (recorded in the app)            → text, manual, is_task, 0 marks
 *   whatsapp (sent to the class group)     → mcq, 0 marks, one "sent" option —
 *                                            last year's shape; an in-app task
 *                                            would block hand-in until recorded
 *   listen (name the rule you heard)       → mcq, exact, media.clip = the slice
 *   voice_reference (record after hearing) → voice task + media.clip = Al-Ḥuṣarī's
 *                                            reading of the ayahs, from QUL timings
 *   match / order                          → checkbox, one option per CELL of the
 *                                            grid (label match:r:c / order:r:c),
 *                                            columns shuffled; marked a row at a
 *                                            time (web/src/lib/homework/choice-grid.ts)
 *   diagram (tap where the sound is made)  → mcq, one option per region of the
 *                                            mouth diagram (label diagram:<region>)
 *   tap_letters                            → checkbox, per_option, one option per
 *                                            LETTER (label L:surah:ayah:word:letter)
 *
 * `--rows <file>` also writes the computed rows as JSON, so a review page can
 * show exactly what would be loaded.
 *
 * Audio on options, and a question's own `clip`, land in questions.media,
 * written only if that column exists (migration 0048), so this file applies
 * cleanly either side of it.
 *
 * Safety: the SQL aborts if any submission on a homework it replaces belongs
 * to an account that is not @bsms-demo.test; demo submissions are deleted
 * (answers, voice notes and attempts cascade).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { REGIONS, type Region } from "../web/src/lib/homework/diagram";
import { ordinal } from "../web/src/lib/homework/choice-grid";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const requireFromWeb = createRequire(join(repoRoot, "web/package.json"));
const { createClient } = requireFromWeb("@supabase/supabase-js");

type Audio = { url: string; start_ms?: number; end_ms?: number };
/** The question's own recording, played above its options ("which letter
 *  is this?"): always a slice, as lib/homework/media.ts requires of a clip. */
type Clip = { url: string; start_ms: number; end_ms: number; label?: string };
type Opt = { text: string; correct: boolean; audio?: string | Audio };
type TapLetter = { t: string; key: boolean };
type TapWord = { t: string; key: boolean; letters?: TapLetter[] };
type Q = {
  n: number; format: string; prompt: string; points: number;
  options?: Opt[] | null; rubric?: { desc: string; marks: number }[] | null; clip?: Clip | null;
  tap?: { surah: number; from: number; to: number; ayahs: { ref: string; words: TapWord[] }[] } | null;
  clip?: { audio_url: string; start_ms: number; end_ms: number } | null;
  reference?: { surah: number; from: number; to: number } | null;
  pairs?: { left: string; right: string }[] | null;
  items?: string[] | null;
  diagram?: { answer: string } | null;
  /** Pictures under the prompt, served from web/public/images/homework (0081). */
  images?: { src: string; alt?: string; width?: number; height?: number }[] | null;
};
type Paper = {
  number: number; series: string; course: string; ordinal: number; term1_week: number | null; title: string; questions: Q[];
  /** False for a paper with nothing to mark (all tasks): kept out of the percentages, which divide by its total. */
  is_graded?: boolean;
};

const env: Record<string, string> = {};
for (const line of readFileSync(join(repoRoot, "web/.env.local"), "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

/** Dollar-quote a string; picks a tag the text can't contain. */
function lit(s: string): string {
  let tag = "q";
  while (s.includes(`$${tag}$`)) tag += "q";
  return `$${tag}$${s}$${tag}$`;
}
const jsonb = (v: unknown) => (v == null ? "null" : `${lit(JSON.stringify(v))}::jsonb`);
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

async function tapOptions(q: Q) {
  const t = q.tap!;
  const { data, error } = await db
    .from("quran_words")
    .select("ayah_number, word_position, text_uthmani, is_end, code_v1, page_number, line_number")
    .eq("surah_number", t.surah).gte("ayah_number", t.from).lte("ayah_number", t.to)
    .order("ayah_number").order("word_position");
  if (error) throw error;
  type Row = { ayah_number: number; word_position: number; text_uthmani: string; is_end: boolean; code_v1: string | null; page_number: number; line_number: number };
  const all = data as Row[];
  const words = all.filter((w) => !w.is_end);
  // The ayah's printed rosette (the is_end row's glyph) rides on its last word,
  // and every word carries its printed line, so TapWords can set the passage in
  // the mushaf's own lines (see web/src/lib/homework/tap-words.ts).
  const endGlyph = new Map(all.filter((w) => w.is_end && w.code_v1).map((w) => [w.ayah_number, w.code_v1 as string]));
  const lastWord = new Map<number, number>();
  for (const w of words) lastWord.set(w.ayah_number, Math.max(lastWord.get(w.ayah_number) ?? 0, w.word_position));
  const drafted = t.ayahs.flatMap((a) => a.words);
  if (words.length !== drafted.length || words.some((w, i) => w.text_uthmani !== drafted[i].t))
    throw new Error(`Q${q.n}: the drafted passage ${t.surah}:${t.from}-${t.to} no longer matches quran_words; re-derive it`);
  return words.map((w, i) => ({
    position: i + 1,
    label: `${t.surah}:${w.ayah_number}:${w.word_position}:${w.page_number}:${w.line_number}`,
    value: !w.code_v1 ? w.text_uthmani
      : lastWord.get(w.ayah_number) === w.word_position && endGlyph.has(w.ayah_number)
        ? `${w.code_v1}\t${w.text_uthmani}\t${endGlyph.get(w.ayah_number)}`
        : `${w.code_v1}\t${w.text_uthmani}`,
    correct: drafted[i].key,
  }));
}

/**
 * A deterministic shuffle that never leaves the items where they started: the
 * grid's labels reach the student, so a column order that matched the key
 * would give it away. Seeded per question so a re-run loads the same grid.
 */
function shuffled(n: number, seed: number): number[] {
  let x = (Math.imul(seed, 2654435761) >>> 0) || 1;
  const rand = () => { // xorshift32: integer maths only, so it is the same everywhere
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
  for (let tries = 0; ; tries++) {
    const perm = [...Array(n).keys()];
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    if (perm.some((v, i) => v !== i) || n < 2 || tries > 20) return perm;
  }
}

/**
 * Rows × columns as checkbox options. `rows[r]` belongs with `cols[key[r]]`;
 * the columns are laid out in shuffled order, so cell (r, c) is right when
 * the column at c is row r's partner.
 */
function gridOptions(kind: "match" | "order", rows: string[], cols: string[], seed: number) {
  const perm = shuffled(cols.length, seed); // perm[c] = which original column sits at c
  return rows.flatMap((rowText, r) => perm.map((orig, c) => ({
    position: r * cols.length + c,
    label: `${kind}:${r}:${c}`,
    value: `${rowText}\t${cols[orig]}`,
    correct: orig === r,
  })));
}

const qulCache = new Map<number, Record<string, { time_from: number; time_to: number }>>();
/** Al-Ḥuṣarī's reading of surah:from–to, as a slice of QUL's surah file. */
async function referenceClip(ref: { surah: number; from: number; to: number }) {
  if (!qulCache.has(ref.surah)) {
    const res = await fetch(`https://qul.tarteel.ai/api/v1/audio/surah_segments/6?surah=${ref.surah}&per_page=300`,
      { headers: { "User-Agent": "Mozilla/5.0 (bsms homework_sql)" } }); // QUL answers 403 without one
    if (!res.ok) throw new Error(`QUL ${ref.surah}: HTTP ${res.status}`);
    qulCache.set(ref.surah, (await res.json()).segments);
  }
  const seg = qulCache.get(ref.surah)!;
  const a = seg[`${ref.surah}:${ref.from}`], b = seg[`${ref.surah}:${ref.to}`];
  if (!a || !b) throw new Error(`QUL has no timing for ${ref.surah}:${ref.from}-${ref.to}`);
  return {
    url: `https://audio-cdn.tarteel.ai/quran/surah/husary/murattal/mp3/${String(ref.surah).padStart(3, "0")}.mp3`,
    start_ms: a.time_from, end_ms: b.time_to,
  };
}

async function letterOptions(q: Q) {
  const t = q.tap!;
  // Each word's letters must spell the word as the mushaf has it.
  const { data, error } = await db
    .from("quran_words")
    .select("ayah_number, word_position, text_uthmani, is_end")
    .eq("surah_number", t.surah).gte("ayah_number", t.from).lte("ayah_number", t.to)
    .order("ayah_number").order("word_position");
  if (error) throw error;
  const words = (data as { ayah_number: number; word_position: number; text_uthmani: string; is_end: boolean }[]).filter((w) => !w.is_end);
  const drafted = t.ayahs.flatMap((a) => a.words);
  const norm = (x: string) => x.normalize("NFC");
  if (words.length !== drafted.length) throw new Error(`Q${q.n}: ${drafted.length} drafted words, the mushaf has ${words.length}`);
  const out = [];
  let position = 1;
  for (const [i, w] of words.entries()) {
    const letters = drafted[i].letters;
    if (!letters?.length) throw new Error(`Q${q.n}: word ${i + 1} has no letters`);
    if (norm(letters.map((l) => l.t).join("")) !== norm(w.text_uthmani))
      throw new Error(`Q${q.n}: letters of ${w.text_uthmani} spell ${letters.map((l) => l.t).join("")}`);
    for (const [k, l] of letters.entries()) {
      out.push({ position: position++, label: `L:${t.surah}:${w.ayah_number}:${w.word_position}:${k + 1}`, value: l.t, correct: l.key });
    }
  }
  return out;
}

let paperNumber = 0;
async function row(q: Q, position: number) {
  const base = { position, prompt: q.prompt, points: q.points, is_task: false, scoring: "exact", options: null as unknown, rubric: null as unknown, media: null as unknown };
  // Past Z (the 29-letter alphabet grid) an option is numbered instead.
  const opts = (o: Opt[]) => o.map((x, i) => ({ position: i, label: `Option ${LETTERS[i] ?? i + 1}`, value: x.text, correct: x.correct }));
  const rubric = (r: Q["rubric"]) => (r && r.length ? r.map((c, i) => ({ id: `c${i + 1}`, desc: c.desc, marks: c.marks })) : null);
  switch (q.format) {
    case "mcq": case "true_false": case "odd_one_out": case "select_all": case "count": {
      const qtype = q.format === "select_all" ? "checkbox" : "mcq";
      let prompt = q.prompt;
      if (q.format === "count" && q.tap) prompt += "\n" + q.tap.ayahs.map((a) => a.words.map((w) => w.t).join(" ")).join(" ");
      // An option's audio is a whole file (a bare URL) or a slice of one —
      // QUL's surah files with the ayah's own span.
      const audio = Object.fromEntries((q.options ?? []).flatMap((o, i) =>
        o.audio ? [[String(i), typeof o.audio === "string" ? { url: o.audio } : o.audio]] : []));
      const media = {
        ...(q.clip ? { clip: q.clip } : {}),
        ...(Object.keys(audio).length ? { option_audio: audio } : {}),
      };
      return { ...base, qtype, prompt, options: opts(q.options ?? []), media: Object.keys(media).length ? media : null };
    }
    case "tap": return { ...base, qtype: "checkbox", scoring: "per_option", options: await tapOptions(q) };
    case "short": return { ...base, qtype: "text", rubric: rubric(q.rubric) };
    case "extended": return { ...base, qtype: "paragraph", rubric: rubric(q.rubric) };
    case "voice": return { ...base, qtype: "text", scoring: "manual", points: 0, is_task: true };
    case "voice_reference":
      if (!q.reference) throw new Error(`Q${q.n}: voice_reference without a reference`);
      return { ...base, qtype: "text", scoring: "manual", points: 0, is_task: true, media: { clip: await referenceClip(q.reference) } };
    case "listen": {
      if (!q.clip) throw new Error(`Q${q.n}: listen without a clip`);
      return { ...base, qtype: "mcq", options: opts(q.options ?? []),
        media: { clip: { url: q.clip.audio_url, start_ms: q.clip.start_ms, end_ms: q.clip.end_ms } } };
    }
    case "match": {
      const pairs = q.pairs ?? [];
      if (pairs.length < 2) throw new Error(`Q${q.n}: match needs pairs`);
      return { ...base, qtype: "checkbox", scoring: "per_option",
        options: gridOptions("match", pairs.map((p) => p.left), pairs.map((p) => p.right), paperNumber * 100 + q.n) };
    }
    case "order": {
      const items = q.items ?? [];
      if (items.length < 2) throw new Error(`Q${q.n}: order needs items`);
      return { ...base, qtype: "checkbox", scoring: "per_option",
        options: gridOptions("order", items.map((_, i) => ordinal(i + 1)), items, paperNumber * 100 + q.n) };
    }
    case "diagram": {
      const answer = q.diagram?.answer as Region | undefined;
      if (!answer || !(answer in REGIONS)) throw new Error(`Q${q.n}: diagram answer "${answer}" is not a region`);
      return { ...base, qtype: "mcq", options: (Object.keys(REGIONS) as Region[]).map((r, i) => ({
        position: i, label: `diagram:${r}`, value: REGIONS[r], correct: r === answer })) };
    }
    case "tap_letters": return { ...base, qtype: "checkbox", scoring: "per_option", options: await letterOptions(q) };
    case "whatsapp":
      return { ...base, qtype: "mcq", points: 0,
        options: [{ position: 0, label: "Option A", value: "Done: I sent my recording to the class WhatsApp group", correct: true }] };
    default: throw new Error(`Q${q.n}: format "${q.format}" has no app shape yet (needs a build)`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const rowsAt = argv.indexOf("--rows");
  const rowsPath = rowsAt >= 0 ? argv.splice(rowsAt, 2)[1] : null;
  const [bundlePath, outPath] = argv;
  if (!bundlePath || !outPath) throw new Error("usage: homework_sql.ts <bundle.json> <out.sql> [--rows <rows.json>]");
  const dumped: Record<number, unknown[]> = {};
  const { papers } = JSON.parse(readFileSync(bundlePath, "utf8")) as { papers: Paper[] };
  const replaced = papers.map((p) => p.number);
  const out: string[] = [];
  out.push(`-- Generated by execution/homework_sql.ts from ${bundlePath.replace(/^.*docs\//, "docs/")}.`,
    `-- Loads homework ${replaced.join(", ")} for 2026/27. Review, then apply with execution/apply_migration.ts.`,
    `-- Idempotent: re-running replaces the same papers again.`, ``,
    `do $guard$ begin`,
    `  if exists (select 1 from submissions s join homeworks h on h.id = s.homework_id`,
    `             join auth.users u on u.id = s.student_id`,
    `             where h.number in (${replaced.join(", ")}) and coalesce(u.email, '') not like '%@bsms-demo.test') then`,
    `    raise exception 'a real student has work on a homework this load replaces; stop and ask';`,
    `  end if;`,
    `end $guard$;`, ``,
    `-- Demo work on the replaced papers (answers, voice notes, attempts cascade).`,
    `delete from submissions where homework_id in (select id from homeworks where number in (${replaced.join(", ")}));`,
    `delete from questions where homework_id in (select id from homeworks where number in (${replaced.join(", ")}));`, ``);
  const mediaUpdates: string[] = [];
  for (const p of papers) {
    const rows = [];
    paperNumber = p.number;
    for (const [i, q] of p.questions.entries()) {
      const r = await row(q, i + 1);
      // Pictures ride beside whatever audio the format put in media.
      if (q.images?.length) r.media = { ...((r.media as object | null) ?? {}), images: q.images };
      rows.push(r);
    }
    dumped[p.number] = rows;
    const total = rows.reduce((s, r) => s + Number(r.points), 0);
    out.push(`-- ── Homework ${p.number}: ${p.title} (${total} marks, ${rows.length} questions)`);
    if (p.term1_week != null && p.number > 100) {
      out.push(`insert into homeworks (number, title, series, total_marks, is_graded, week_id, due_at, course_id, ordinal)`,
        `select ${p.number}, ${lit(p.title)}, '${p.series}', ${total}, ${p.is_graded === false ? "false" : "true"}, w.id, w.due_at, c.id, ${p.ordinal}`,
        `  from weeks w, courses c where w.term_id = 1 and w.number = ${p.term1_week} and c.key = '${p.course}'`,
        `on conflict (number) do update set title = excluded.title, series = excluded.series, total_marks = excluded.total_marks,`,
        `  is_graded = ${p.is_graded === false ? "false" : "true"}, course_id = excluded.course_id, ordinal = excluded.ordinal;`);
    } else {
      out.push(`update homeworks set title = ${lit(p.title)}, series = '${p.series}', total_marks = ${total}, is_graded = ${p.is_graded === false ? "false" : "true"},`,
        `  course_id = (select id from courses where key = '${p.course}'), ordinal = ${p.ordinal}`,
        `  where number = ${p.number};`);
    }
    for (const r of rows) {
      out.push(`insert into questions (homework_id, position, qtype, scoring, prompt, points, is_bonus, is_task, options, rubric, needs_key)`,
        `select id, ${r.position}, '${r.qtype}', '${r.scoring}', ${lit(r.prompt)}, ${r.points}, false, ${r.is_task}, ${jsonb(r.options)}, ${jsonb(r.rubric)}, false`,
        `  from homeworks where number = ${p.number};`);
      if (r.media) mediaUpdates.push(`    update questions set media = ${jsonb(r.media)} where position = ${r.position} and homework_id = (select id from homeworks where number = ${p.number});`);
    }
    out.push("");
  }
  if (mediaUpdates.length) {
    // PL/pgSQL plans a statement only when it runs, so these never touch a
    // missing column: before 0048 the branch is skipped, after it they apply.
    out.push(`-- Audio needs questions.media (migration 0048); skipped until it exists.`,
      `do $media$ begin`,
      `  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'questions' and column_name = 'media') then`,
      ...mediaUpdates,
      `  end if;`, `end $media$;`, ``);
  }
  out.push(`select number, title, total_marks, (select count(*) from questions q where q.homework_id = h.id) as questions`,
    `  from homeworks h where number in (${replaced.join(", ")}) order by number;`);
  writeFileSync(outPath, out.join("\n") + "\n");
  if (rowsPath) writeFileSync(rowsPath, JSON.stringify(dumped, null, 1));
  console.log(`wrote ${outPath}: ${papers.length} papers, ${papers.reduce((s, p) => s + p.questions.length, 0)} questions${mediaUpdates.length ? `, ${mediaUpdates.length} with audio` : ""}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
