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
 *
 * Audio on options lands in questions.media, written only if that column
 * exists (migration 0048), so this file applies cleanly either side of it.
 *
 * Safety: the SQL aborts if any submission on a homework it replaces belongs
 * to an account that is not @bsms-demo.test; demo submissions are deleted
 * (answers, voice notes and attempts cascade).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const requireFromWeb = createRequire(join(repoRoot, "web/package.json"));
const { createClient } = requireFromWeb("@supabase/supabase-js");

type Audio = { url: string; start_ms?: number; end_ms?: number };
type Opt = { text: string; correct: boolean; audio?: string | Audio };
type TapWord = { t: string; key: boolean };
type Q = {
  n: number; format: string; prompt: string; points: number;
  options?: Opt[] | null; rubric?: { desc: string; marks: number }[] | null;
  tap?: { surah: number; from: number; to: number; ayahs: { ref: string; words: TapWord[] }[] } | null;
};
type Paper = { number: number; series: string; course: string; ordinal: number; term1_week: number | null; title: string; questions: Q[] };

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

async function row(q: Q, position: number) {
  const base = { position, prompt: q.prompt, points: q.points, is_task: false, scoring: "exact", options: null as unknown, rubric: null as unknown, media: null as unknown };
  const opts = (o: Opt[]) => o.map((x, i) => ({ position: i, label: `Option ${LETTERS[i]}`, value: x.text, correct: x.correct }));
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
      return { ...base, qtype, prompt, options: opts(q.options ?? []), media: Object.keys(audio).length ? { option_audio: audio } : null };
    }
    case "tap": return { ...base, qtype: "checkbox", scoring: "per_option", options: await tapOptions(q) };
    case "short": return { ...base, qtype: "text", rubric: rubric(q.rubric) };
    case "extended": return { ...base, qtype: "paragraph", rubric: rubric(q.rubric) };
    case "voice": return { ...base, qtype: "text", scoring: "manual", points: 0, is_task: true };
    case "whatsapp":
      return { ...base, qtype: "mcq", points: 0,
        options: [{ position: 0, label: "Option A", value: "Done: I sent my recording to the class WhatsApp group", correct: true }] };
    default: throw new Error(`Q${q.n}: format "${q.format}" has no app shape yet (needs a build)`);
  }
}

async function main() {
  const [bundlePath, outPath] = process.argv.slice(2);
  if (!bundlePath || !outPath) throw new Error("usage: homework_sql.ts <bundle.json> <out.sql>");
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
    for (const [i, q] of p.questions.entries()) rows.push(await row(q, i + 1));
    const total = rows.reduce((s, r) => s + Number(r.points), 0);
    out.push(`-- ── Homework ${p.number}: ${p.title} (${total} marks, ${rows.length} questions)`);
    if (p.term1_week != null && p.number > 100) {
      out.push(`insert into homeworks (number, title, series, total_marks, is_graded, week_id, due_at, course_id, ordinal)`,
        `select ${p.number}, ${lit(p.title)}, '${p.series}', ${total}, true, w.id, w.due_at, c.id, ${p.ordinal}`,
        `  from weeks w, courses c where w.term_id = 1 and w.number = ${p.term1_week} and c.key = '${p.course}'`,
        `on conflict (number) do update set title = excluded.title, series = excluded.series, total_marks = excluded.total_marks,`,
        `  is_graded = true, course_id = excluded.course_id, ordinal = excluded.ordinal;`);
    } else {
      out.push(`update homeworks set title = ${lit(p.title)}, series = '${p.series}', total_marks = ${total}, is_graded = true,`,
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
    out.push(`-- Option audio needs questions.media (migration 0048); skipped until it exists.`,
      `do $media$ begin`,
      `  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'questions' and column_name = 'media') then`,
      ...mediaUpdates,
      `  end if;`, `end $media$;`, ``);
  }
  out.push(`select number, title, total_marks, (select count(*) from questions q where q.homework_id = h.id) as questions`,
    `  from homeworks h where number in (${replaced.join(", ")}) order by number;`);
  writeFileSync(outPath, out.join("\n") + "\n");
  console.log(`wrote ${outPath}: ${papers.length} papers, ${papers.reduce((s, p) => s + p.questions.length, 0)} questions${mediaUpdates.length ? `, ${mediaUpdates.length} with audio` : ""}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
