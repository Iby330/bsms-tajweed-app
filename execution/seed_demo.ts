/**
 * seed_demo.ts — fictional demo cohort for the teacher-group walkthrough.
 *
 * Creates auth users + profiles + a full year of plausible activity so every
 * screen has something real to show. ALL STUDENT NAMES ARE INVENTED — no
 * real BSMS student data is ever written to the database or the repo.
 *
 * Run:  cd web && npx tsx ../execution/seed_demo.ts
 * Idempotent: re-running updates the same accounts (matched by email).
 *
 * Deliberate staging (so the demo tells a story):
 *  · HW 1–3 approved for most students → progress tiles and leaderboards populate
 *  · HW 4 sits in `submitted` for one class → the approval queue is live on camera
 *  · hifz spread across below / on / above pace
 *  · a couple of strikes and a part-filled attendance register
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

const PASSWORD = "BsmsDemo2026!";
const DOMAIN = "bsms-demo.test"; // reserved TLD — cannot receive real mail

type Person = { name: string; email: string; className: string };

const TEACHERS: Person[] = [
  { name: "Daniyal Rahman", email: "daniyal", className: "Masjid An-Nabawi" },
  { name: "Moadh Bennani", email: "moadh", className: "Masjid Al-Aqsa" },
  { name: "Yunus Patel", email: "yunus", className: "Masjid Al-Haram" },
  { name: "Ola Farouk", email: "ola", className: "Zukhruf" },
  { name: "Iman Cherif", email: "iman", className: "Hareer" },
  { name: "Wala Haddad", email: "wala", className: "Rayyan" },
  { name: "Maryam Siddiqui", email: "maryam", className: "Salsabeel" },
];

// entirely invented students
const STUDENTS: Person[] = [
  { name: "Adam Whitfield", email: "adam.w", className: "Masjid An-Nabawi" },
  { name: "Bilal Osei", email: "bilal.o", className: "Masjid An-Nabawi" },
  { name: "Idris Kaya", email: "idris.k", className: "Masjid An-Nabawi" },
  { name: "Zayd Marchetti", email: "zayd.m", className: "Masjid Al-Aqsa" },
  { name: "Harun Delgado", email: "harun.d", className: "Masjid Al-Aqsa" },
  { name: "Suleiman Novak", email: "suleiman.n", className: "Masjid Al-Aqsa" },
  { name: "Tariq Lindqvist", email: "tariq.l", className: "Masjid Al-Haram" },
  { name: "Kareem Bassett", email: "kareem.b", className: "Masjid Al-Haram" },
  { name: "Nuh Ferreira", email: "nuh.f", className: "Masjid Al-Haram" },
  { name: "Safiyya Toledano", email: "safiyya.t", className: "Zukhruf" },
  { name: "Ruqayya Mbeki", email: "ruqayya.m", className: "Zukhruf" },
  { name: "Halima Sørensen", email: "halima.s", className: "Zukhruf" },
  { name: "Nusayba Okonjo", email: "nusayba.o", className: "Hareer" },
  { name: "Jamila Varga", email: "jamila.v", className: "Hareer" },
  { name: "Rabia Lindholm", email: "rabia.l", className: "Rayyan" },
  { name: "Sumayya Achebe", email: "sumayya.a", className: "Rayyan" },
  { name: "Khadija Ferrand", email: "khadija.f", className: "Rayyan" },
  { name: "Amina Castellanos", email: "amina.c", className: "Salsabeel" },
  { name: "Zaynab Hourani", email: "zaynab.h", className: "Salsabeel" },
  { name: "Fatima Nkemdirim", email: "fatima.n", className: "Salsabeel" },
];

/** Deterministic pseudo-random so re-seeding gives the same demo. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

async function upsertUser(p: Person, role: "teacher" | "student", section: "brothers" | "sisters", classId: string) {
  const email = `${p.email}@${DOMAIN}`;
  const { data: created, error } = await db.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: p.name },
  });

  let userId = created?.user?.id;
  if (error) {
    // already exists → find them
    const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    userId = list?.users.find((u) => u.email === email)?.id;
    if (!userId) throw new Error(`could not create or find ${email}: ${error.message}`);
  }

  await db.from("profiles").upsert({
    id: userId!,
    full_name: p.name,
    role,
    section,
    class_id: classId,
    is_active: true,
  });
  return userId!;
}

async function main() {
  console.log("seeding demo cohort…");

  const { data: classes } = await db.from("classes").select("id, name, section");
  if (!classes?.length) throw new Error("no classes — run migrations first");
  const classByName = new Map(classes.map((c) => [c.name, c]));

  // ── people ──────────────────────────────────────────────────────────
  const teacherIds = new Map<string, string>();
  for (const t of TEACHERS) {
    const cls = classByName.get(t.className)!;
    const id = await upsertUser(t, "teacher", cls.section, cls.id);
    teacherIds.set(t.className, id);
    await db.from("classes").update({ teacher_id: id }).eq("id", cls.id);
  }
  console.log(`  ${TEACHERS.length} teachers`);

  const studentIds = new Map<string, string>();
  for (const s of STUDENTS) {
    const cls = classByName.get(s.className)!;
    studentIds.set(s.name, await upsertUser(s, "student", cls.section, cls.id));
  }
  console.log(`  ${STUDENTS.length} students`);

  // ── hifz: class target 43, spread of progress ───────────────────────
  const { data: surahs } = await db
    .from("surahs").select("number, order_index").order("order_index");
  const rand = rng(20260730);

  for (const [i, s] of STUDENTS.entries()) {
    const id = studentIds.get(s.name)!;
    await db.from("hifz_profiles").upsert({
      student_id: id, start_surah: 114, target_count: 43,
    });
    // deliberate spread: ~a third below pace, a third on, a third above
    const passed = 18 + Math.floor(rand() * 20); // 18..37 — late-year spread
    const rows = (surahs ?? []).slice(0, passed).map((su, j) => ({
      student_id: id,
      surah_number: su.number,
      passed_at: new Date(Date.UTC(2026, 9, 12 + j * 4)).toISOString().slice(0, 10),
      teacher_comment:
        j === passed - 1 ? "Watch the madd length on the final ayah." : null,
      marked_by: teacherIds.get(s.className)!,
    }));
    if (rows.length) await db.from("hifz_records").upsert(rows);
    if (i === 0) console.log(`  hifz records seeded (first student: ${passed} surahs)`);
  }

  // ── homework activity ───────────────────────────────────────────────
  const { data: homeworks } = await db
    .from("homeworks").select("id, number, total_marks").lte("number", 21).order("number");
  const { data: allQuestions } = await db
    .from("questions")
    .select("id, homework_id, qtype, points, is_bonus, is_task, options, rubric");

  // newest homework in the seeded range — left unapproved on purpose
  const QUEUE_HW = Math.max(...(homeworks ?? []).map((h) => h.number));

  let submissionCount = 0;
  let queuedCount = 0;

  for (const hw of homeworks ?? []) {
    const qs = (allQuestions ?? []).filter((q) => q.homework_id === hw.id);
    for (const s of STUDENTS) {
      const studentId = studentIds.get(s.name)!;
      // the newest homework stays unapproved for two classes → the approval
      // queue is live on camera during the walkthrough
      const isQueue =
        hw.number === QUEUE_HW &&
        (s.className === "Masjid Al-Aqsa" || s.className === "Salsabeel");
      // a few students simply didn't submit — proves zeros are EXCLUDED,
      // not counted, in the termly average
      const skipped =
        (hw.number === 3 && (s.name === "Idris Kaya" || s.name === "Jamila Varga")) ||
        (hw.number === 11 && s.name === "Idris Kaya") ||
        (hw.number === 17 && s.name === "Harun Delgado");
      if (skipped) continue;

      const ability = 0.55 + rand() * 0.45; // per-student-per-hw quality

      const { data: sub } = await db
        .from("submissions")
        .upsert(
          {
            homework_id: hw.id,
            student_id: studentId,
            status: isQueue ? "submitted" : "approved",
            is_late: rand() < 0.08,
            submitted_at: new Date(Date.UTC(2026, 6, 6 + hw.number * 7)).toISOString(),
            ...(isQueue
              ? {}
              : {
                  approved_by: teacherIds.get(s.className)!,
                  approved_at: new Date(Date.UTC(2026, 6, 8 + hw.number * 7)).toISOString(),
                }),
          },
          { onConflict: "homework_id,student_id" },
        )
        .select("id")
        .single();
      if (!sub) continue;

      const answerRows = qs.map((q) => {
        const points = Number(q.points);
        const opts = Array.isArray(q.options) ? (q.options as { position: number; correct: boolean }[]) : null;
        const correct = opts?.filter((o) => o.correct).map((o) => o.position) ?? [];
        const gotIt = rand() < ability;

        let response: unknown;
        if (q.qtype === "mcq" || q.qtype === "checkbox") {
          response = {
            selected: gotIt
              ? correct
              : opts?.length
                ? [opts[Math.floor(rand() * opts.length)].position]
                : [],
          };
        } else if (q.is_task) {
          response = { text: "Yes !" };
        } else {
          response = {
            text: gotIt
              ? "مد طبيعي — the natural madd, two harakat"
              : "not sure",
          };
        }

        const marks = q.is_task ? 0 : gotIt ? points : Math.round(points * 0.4 * 100) / 100;
        return {
          submission_id: sub.id,
          question_id: q.id,
          response,
          auto_marks: isQueue ? null : marks,
          final_marks: isQueue ? null : marks,
        };
      });

      if (answerRows.length) {
        await db.from("answers").upsert(answerRows, { onConflict: "submission_id,question_id" });
      }
      submissionCount++;
      if (isQueue) queuedCount++;
    }
  }
  console.log(`  ${submissionCount} submissions (${queuedCount} awaiting review)`);

  // ── exams: term 1 only (exam is 80% of the grade) ───────────────────
  const EXAM_MAX: Record<number, number> = { 1: 89, 2: 93, 3: 98 };
  const examRows = STUDENTS.flatMap((s) =>
    [1, 2, 3].map((termId) => ({
      student_id: studentIds.get(s.name)!,
      term_id: termId,
      score: Math.round((EXAM_MAX[termId] * (0.58 + rand() * 0.38)) * 10) / 10,
      entered_by: teacherIds.get(s.className)!,
    })),
  );
  await db.from("exam_scores").upsert(examRows);
  console.log(`  ${examRows.length} exam scores (all three terms)`);

  // ── strikes ─────────────────────────────────────────────────────────
  const strikeSpec: [string, "absence" | "homework" | "conduct", string][] = [
    ["Idris Kaya", "homework", "Homework 3 not submitted."],
    ["Idris Kaya", "absence", "Missed Monday class, no reason given."],
    ["Jamila Varga", "homework", "Homework 3 not submitted."],
    ["Harun Delgado", "absence", "Unauthorised absence."],
  ];
  await db.from("strikes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  for (const [name, reason, note] of strikeSpec) {
    const s = STUDENTS.find((x) => x.name === name)!;
    await db.from("strikes").insert({
      student_id: studentIds.get(name)!,
      term_id: 1,
      reason,
      note,
      issued_by: teacherIds.get(s.className)!,
    });
  }
  console.log(`  ${strikeSpec.length} strikes`);

  // ── attendance: last two Mondays + Thursdays ────────────────────────
  const dates: [string, "monday" | "thursday"][] = [
    ["2026-10-12", "monday"], ["2026-10-15", "thursday"],
    ["2026-10-19", "monday"], ["2026-10-22", "thursday"],
  ];
  const attRows = [];
  for (const [date, type] of dates) {
    for (const s of STUDENTS) {
      const present = rand() > 0.12;
      attRows.push({
        class_id: classByName.get(s.className)!.id,
        student_id: studentIds.get(s.name)!,
        session_date: date,
        session_type: type,
        present,
        absence_reason: present ? null : "Illness",
        recorded_by: teacherIds.get(s.className)!,
      });
    }
  }
  await db.from("attendance").upsert(attRows, {
    onConflict: "student_id,session_date,session_type",
  });
  console.log(`  ${attRows.length} attendance records`);

  console.log(`\ndone. sign in as:`);
  console.log(`  teacher  yunus@${DOMAIN}   / ${PASSWORD}`);
  console.log(`  student  adam.w@${DOMAIN}  / ${PASSWORD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
