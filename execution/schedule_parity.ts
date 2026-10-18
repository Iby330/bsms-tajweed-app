/**
 * schedule_parity.ts — check that the app and the database agree on when
 * every item opens, when it is due and whether it is held, for every class.
 *
 *   cd web && npx tsx ../execution/schedule_parity.ts
 *
 * The app works these dates out in TypeScript (web/src/lib/curriculum/tree.ts)
 * to draw the screens; the database works them out in SQL
 * (class_item_unlock_at / class_item_due_at / class_item_held, 0108) to decide
 * what a student may open and when their work is late. If the two disagree, a
 * student sees a card that will not open, or is marked late against a date
 * the screen never showed. Run this before and after any schedule migration,
 * and after loading content. Read-only: it only runs SELECTs.
 *
 * Exit code 0 when every item agrees, 1 otherwise (each difference printed).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { scheduleFromRows, ruleFromRow, type ScheduleInput } from "../web/src/lib/curriculum/schedule-rows";
import { itemHeld, scheduledDueAt, scheduledUnlockAt } from "../web/src/lib/curriculum/tree";

const ROOT = resolve(import.meta.dirname, "..");
const PROJECT_REF = "ssqeakiutclbiwizrchh";

function token(): string {
  for (const line of readFileSync(resolve(ROOT, ".env"), "utf8").split("\n")) {
    const m = /^\s*SUPABASE_ACCESS_TOKEN\s*=\s*"?([^"\s#]+)/.exec(line);
    if (m) return m[1];
  }
  throw new Error("SUPABASE_ACCESS_TOKEN is not in .env");
}

async function sql<T>(query: string): Promise<T> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`SQL failed (${res.status}): ${await res.text()}`);
  return (await res.json()) as T;
}

const json = async <T>(query: string) => ((await sql<{ j: T }[]>(`select coalesce(json_agg(x), '[]') j from (${query}) x`))[0].j);

async function main() {
  // Whether 0108 is in: before it, the new tables and columns do not exist.
  const [{ applied }] = await sql<{ applied: boolean }[]>(
    `select exists (select 1 from information_schema.tables where table_name = 'class_item_dates') applied`);

  const [classes, courses, items, weeks, sectionWeeks, ords] = await Promise.all([
    json<{ id: string; name: string; section: string; open_weekday: number | null; open_time: string | null; due_weekday: number | null; due_time: string | null; due_weeks_after: number | null }[]>(
      applied ? `select id, name, section, open_weekday, open_time::text, due_weekday, due_time::text, due_weeks_after from classes where section <> 'demo'`
              : `select id, name, section, null::int open_weekday, null open_time, null::int due_weekday, null due_time, 0 due_weeks_after from classes where section <> 'demo'`),
    json<{ class_id: string; course_id: string; term_id: number; position: number; due_days_after_unlock: number | null; key: string; label: string }[]>(
      `select cc.class_id, cc.course_id, cc.term_id, cc.position, cc.due_days_after_unlock, k.key, k.label from class_courses cc join courses k on k.id = cc.course_id`),
    json<{ class_id: string; course_id: string; ordinal: number; week_number: number }[]>(`select class_id, course_id, ordinal, week_number from class_course_items`),
    json<{ id: string; term_id: number; number: number; unlock_at: string; due_at: string | null }[]>(`select id, term_id, number, unlock_at, due_at from weeks`),
    json<{ section: string; week_id: string; unlock_at: string; due_at: string }[]>(`select section, week_id, unlock_at, due_at from section_weeks`),
    json<{ course_id: string; ordinal: number }[]>(
      `select distinct course_id, ordinal from (select course_id, ordinal from lessons union select course_id, ordinal from homeworks) u where course_id is not null and ordinal is not null`),
  ]);
  const [dates, holds, added] = applied ? await Promise.all([
    json<ScheduleInput["dates"] & { class_id: string }[]>(`select * from class_item_dates`),
    json<{ class_id: string; course_id: string; from_ordinal: number }[]>(`select * from class_homework_holds`),
    json<(ScheduleInput["added"][number] & { class_id: string; key: string; label: string })[]>(
      `select a.*, k.key, k.label from class_added_items a join courses k on k.id = a.course_id`),
  ]) : [[], await json<{ class_id: string; course_id: string; from_ordinal: number }[]>(`select * from class_homework_holds`), []];

  // What the database says, for every class and every item it meets.
  const db = await json<{ c: string; k: string; o: number; u: string | null; d: string | null; h: boolean }[]>(`
    select c.id c, x.course_id k, x.ordinal o, class_item_unlock_at(c.id, x.course_id, x.ordinal) u,
           class_item_due_at(c.id, x.course_id, x.ordinal) d,
           ${applied ? "class_item_held(c.id, x.course_id, x.ordinal)" : "exists (select 1 from class_homework_holds h where h.class_id = c.id and h.course_id = x.course_id and x.ordinal >= h.from_ordinal)"} h
      from classes c
      cross join (select distinct course_id, ordinal from (select course_id, ordinal from lessons union select course_id, ordinal from homeworks) u
                   where course_id is not null and ordinal is not null) x
     where c.section <> 'demo'`);
  const dbByKey = new Map(db.map((r) => [`${r.c}|${r.k}|${r.o}`, r]));

  let checked = 0;
  const diffs: string[] = [];
  const same = (a: string | null | undefined, b: string | null | undefined) =>
    (a == null && b == null) || (a != null && b != null && Date.parse(a) === Date.parse(b));

  for (const cl of classes) {
    const schedule = scheduleFromRows({
      rows: courses.filter((r) => r.class_id === cl.id).sort((a, b) => a.term_id - b.term_id || a.position - b.position)
        .map((r) => ({ ...r, courses: { key: r.key, label: r.label } })),
      items: items.filter((i) => i.class_id === cl.id),
      section: cl.section,
      rule: ruleFromRow(cl),
      weeks, sectionWeeks,
      dates: dates.filter((d) => d.class_id === cl.id),
      holds: holds.filter((h) => h.class_id === cl.id),
      added: added.filter((a) => a.class_id === cl.id).map((a) => ({ ...a, courses: { key: a.key, label: a.label } })),
    });
    if (!schedule) continue;
    for (const sc of schedule.courses) {
      for (const { ordinal } of ords.filter((o) => o.course_id === sc.courseId)) {
        if (sc.ordinals && !sc.ordinals.includes(ordinal)) continue;
        const row = dbByKey.get(`${cl.id}|${sc.courseId}|${ordinal}`);
        const tsU = scheduledUnlockAt(schedule, sc.termId, ordinal, sc.courseId);
        const tsD = scheduledDueAt(schedule, sc.termId, ordinal, sc.courseId);
        const tsH = itemHeld(schedule, ordinal, sc.courseId);
        checked++;
        const where = `${cl.name} · ${sc.label} ${ordinal}`;
        if (!same(tsU, row?.u)) diffs.push(`${where}: opens app ${tsU} / db ${row?.u}`);
        if (!same(tsD, row?.d)) diffs.push(`${where}: due app ${tsD} / db ${row?.d}`);
        if (tsH !== (row?.h ?? false)) diffs.push(`${where}: held app ${tsH} / db ${row?.h}`);
      }
    }
  }

  console.log(`${applied ? "0108 applied" : "before 0108"}: ${checked} items checked across ${classes.length} classes, ${diffs.length} difference${diffs.length === 1 ? "" : "s"}.`);
  for (const d of diffs) console.log("  " + d);
  process.exit(diffs.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
