import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import { getTermsAndWeeks } from "@/lib/dashboard/queries";
import { getCachedSurahs } from "@/lib/reference/cached";
import { expectedPassed, paceStatus, memorisationList, type Surah } from "@/lib/hifz/pace";
import { HifzGrid, type MarkRow } from "@/components/app/hifz-grid";
import { ResultButton } from "@/components/app/result-button";
import { Rule } from "@/components/app/rule";
import { teacherClass } from "@/lib/teacher/scope";
import { timetableFor, weekdayNameFor } from "@/lib/attendance/calendar";
import { hearingsForStudent } from "@/lib/hifz/hearing-queries";
import { heardSurahs } from "@/lib/hifz/hearings";
import { revisionActivityFor } from "@/lib/hifz/activity-queries";
import { londonDayKey } from "@/lib/hifz/revision-activity";
import { parseSource } from "@/lib/hifz/mistake-board";
import { RevisionHeatmap } from "@/components/app/revision-heatmap";
import { MistakeBoard } from "@/components/app/mistake-board";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PACE_LABEL = { ok: "Ahead", warn: "On pace", danger: "Behind" } as const;

/**
 * One student's hifdh: where they are, their pace, the record as the
 * marking grid, and Pass / Not passed, the result popup for them. Below the
 * run, their revision: the same activity grid and mistakes board the
 * student sees on their own Overview. Hearing is on the register's Hear tab.
 *
 * This is deliberately the student's own view of their year — the mushaf index,
 * banded by hizb — rather than a teacher-shaped list of rows. Both people end
 * up looking at the same shape, which matters on a Thursday when they are
 * looking at it together, and the run reads as a run instead of forty-odd
 * lines. Each cell opens the surah's record.
 */
export default async function StudentHifzDetail({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ tab?: string; src?: string; heat?: string }>;
}) {
  const [{ studentId }, { tab, src, heat }] = await Promise.all([params, searchParams]);
  // Hear (once Review) moved to the register: old links land there.
  if (tab === "hear" || tab === "review") {
    redirect(`/teacher/hifdh?tab=hear&student=${encodeURIComponent(studentId)}`);
  }
  const db = await supabaseServer();

  // Every read here is keyed on the student id alone, the guard included — it
  // decides whether to render, not what to fetch, so it goes out with the rest.
  const [{ weeksFor }, mine, { data: student }, { data: hp }, surahs, { data: records }, hearings, activity] = await Promise.all([
    getTermsAndWeeks(),
    teacherClass(),
    db
      .from("profiles")
      .select("full_name, class_id, section, classes!profiles_class_id_fkey(name)")
      .eq("id", studentId)
      .maybeSingle(),
    db.from("hifz_profiles").select("start_surah, target_count").eq("student_id", studentId).maybeSingle(),
    getCachedSurahs(),
    db
      .from("hifz_records")
      .select("surah_number, teacher_comment, passed_at")
      .eq("student_id", studentId),
    hearingsForStudent(studentId),
    revisionActivityFor(studentId),
  ]);
  if (!student) notFound();
  // A teacher with a class of their own sees only their own students, the same
  // way the roster page decides it. Without this, one guessed URL showed any
  // student's hifdh record — and, worse, offered the buttons that sign their
  // surahs off. Usability and blast-radius scoping, not a security boundary:
  // RLS still grants teachers the whole cohort.
  if (mine && student.class_id !== mine.id) notFound();

  const className = student.classes?.name ?? null;
  // The recitation day is the class's, not the programme's, so it comes off
  // the timetable rather than being spelled into the sentence.
  const recitationDay = weekdayNameFor(
    timetableFor(mine?.section ?? student.section, className),
    "hifdh",
  );

  // The masthead is the same with or without a target.
  const shell = (body: ReactNode, action?: ReactNode) => (
    <>
      <header className="masthead">
        <Link href="/teacher/hifdh" className="backstep">
          <ArrowLeft className="size-[13px]" aria-hidden />
          Hifdh register
        </Link>
        <h1>
          <b>{student.full_name}</b>
        </h1>
        <p>
          {className
            ? `${className} · ${recitationDay} recitation`
            : `${recitationDay} recitation`}
        </p>
        {action}
      </header>

      {body}
    </>
  );

  const all = surahs as Surah[];
  const list = hp ? memorisationList(hp.start_surah, hp.target_count, all) : [];
  if (list.length === 0) {
    return shell(
      <>
        <Rule label="The run" />
        <div className="field">
          <p className="box c12 note">
            No target set yet. Choose one on the{" "}
            <Link href="/teacher/hifdh" className="underline">
              register
            </Link>{" "}
            and this student’s run appears here.
          </p>
        </div>
      </>,
    );
  }

  const recMap = new Map((records ?? []).map((r) => [r.surah_number, r]));
  const heardSet = heardSurahs(hearings);
  const rows: MarkRow[] = list.map((s) => {
    const rec = recMap.get(s.number);
    return {
      number: s.number,
      name_en: s.name_en,
      name_ar: s.name_ar,
      passed: Boolean(rec),
      heard: heardSet.has(s.number),
      comment: rec?.teacher_comment ?? null,
      passedAt: rec?.passed_at ?? null,
    };
  });

  // Counted over the run, not over the record: hifz_records is lifetime, so a
  // returning student's earlier years would otherwise inflate this year's work.
  const passed = rows.filter((r) => r.passed).length;
  const target = list.length;
  // the student's section's calendar, as her own Hifdh page reads it
  const expected = expectedPassed(new Date(), weeksFor(student.section), target);
  const complete = passed === target;
  const pace = !complete && expected > 0 ? paceStatus(passed, expected) : null;
  const next = rows.find((r) => !r.passed);
  const commented = rows.filter((r) => r.comment).length;
  const names = Object.fromEntries(all.map((s) => [s.number, { ar: s.name_ar, en: s.name_en }]));
  const passedBefore: Record<number, string> = Object.fromEntries(
    (records ?? []).map((r) => [r.surah_number, r.passed_at]),
  );

  return shell(
    <>
      <Rule label="Where they are" />

      <div className="field">
        <div className="box c4">
          <span className="label">Signed off</span>
          <div className="stat">
            <span className="v sm">{passed}</span>
            <span className="u">of {target}</span>
          </div>
          <p className="note">
            {expected > 0 ? `${expected} expected by now` : "the year hasn't started"}
          </p>
        </div>

        <div className="box c4">
          <span className="label">{complete ? "The run" : "Next to hear"}</span>
          {complete ? (
            <div className="stat">
              <span className="v sm">Complete</span>
            </div>
          ) : (
            <>
              <span dir="rtl" lang="ar" className="ar-quran ar-figure">
                {next?.name_ar}
              </span>
              <p className="note">{next?.name_en}</p>
            </>
          )}
        </div>

        <div className="box c4">
          <span className="label">Pace</span>
          <div className="stat">
            <span
              className={cn(
                "v sm",
                pace === "ok" && "text-ok",
                pace === "warn" && "text-warn",
                pace === "danger" && "text-danger",
              )}
            >
              {complete ? "–" : pace ? PACE_LABEL[pace] : "not yet"}
            </span>
          </div>
          <p className="note">
            {commented
              ? `${commented} surah${commented === 1 ? "" : "s"} with a comment`
              : "no comments left yet"}
          </p>
        </div>
      </div>

      <Rule label="The run" />

      <div className="field">
        <HifzGrid studentId={studentId} rows={rows} expected={expected} />
      </div>

      <Rule label="Their revision" />

      <div className="field">
        <section className="box c12" aria-label="Revision activity">
          {/* UK day, resolved here: see the student Overview for why */}
          <RevisionHeatmap days={activity} end={londonDayKey(new Date())} />
        </section>
        <MistakeBoard
          studentId={studentId}
          source={parseSource(src)}
          heat={heat}
          basePath={`/teacher/hifdh/${studentId}`}
          run={list}
          surahHref={(n, p) => `/teacher/hifdh/${studentId}/${n}${p ? `?p=${p}` : ""}`}
          viewer="teacher"
        />
      </div>
    </>,
    <div style={{ marginTop: 12 }}>
      <ResultButton
        studentId={studentId}
        studentName={student.full_name}
        run={list.map((s) => s.number)}
        from={next?.number ?? list[list.length - 1].number}
        names={names}
        passedBefore={passedBefore}
      />
    </div>,
  );
}
