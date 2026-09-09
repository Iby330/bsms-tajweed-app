import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { getTermsAndWeeks, currentTermId } from "@/lib/dashboard/queries";
import { teacherClass, teacherRoster } from "@/lib/teacher/scope";
import { isoDate } from "@/lib/attendance/session";
import {
  nearestSessionDate,
  nextSessionDate,
  previousSessionDate,
  sessionTypeFor,
  timetableFor,
} from "@/lib/attendance/calendar";
import { sessionLabel } from "@/lib/attendance/session";
import { AttendanceRegister } from "@/components/app/attendance-register";
import { SessionCalendar } from "@/components/app/session-calendar";

export const dynamic = "force-dynamic";

/** Midday, so a DST boundary cannot shunt the clock across a day. */
const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

export default async function Attendance({
  searchParams,
}: {
  searchParams: Promise<{ class?: string; date?: string }>;
}) {
  const { date: dateParam } = await searchParams;
  const db = await supabaseServer();

  // Two different questions, so two different resolvers.
  //
  // With no date asked for, the register opens on the lesson about to be
  // taught: an off day resolves forward to the section's next teaching day —
  // and across a whole break, if that is where the next lesson is — while a
  // lesson day is itself. That is the register the teacher is walking into a
  // room to take.
  //
  // A hand-typed ?date= is snapped BACKWARDS to a real lesson day instead —
  // it is a date they chose, and resolving it forward would answer a question
  // they did not ask by quietly moving them to the following session.
  const today = isoDate(new Date());

  // The class has to be known BEFORE any date can be resolved: which weekdays
  // are lesson days is a property of the class, so a sisters' register and a
  // brothers' register opened on the same Monday disagree about which subject
  // is being taught — and on a Wednesday, about whether there is a lesson.
  const [{ terms }, mine] = await Promise.all([getTermsAndWeeks(), teacherClass()]);

  if (!mine) {
    return (
      <p className="empty">
        You have no class assigned yet.
      </p>
    );
  }

  const timetable = timetableFor(mine.section, mine.name);
  const sessionDate = dateParam
    ? nearestSessionDate(dateParam, timetable)
    : nextSessionDate(today, timetable);
  const sessionType = sessionTypeFor(sessionDate, timetable)!;
  const termId = currentTermId(terms, new Date(`${sessionDate}T12:00:00`));

  // Opening on the NEXT lesson means the last one is off screen, and a
  // register nobody filled in is silent on its own — the failure mode is a
  // session that quietly never got taken. Only a session that has actually
  // happened is worth asking about, so anything still in the future is
  // skipped, as is the year's first session, which has nothing behind it.
  const prev = previousSessionDate(sessionDate, timetable);
  const prevDue = prev && prev <= today ? prev : null;

  // The register stamps every row it writes with this class, so the session
  // can be read by class rather than waiting on the roster to name its
  // students. The rows are the same either way; the round trips are one fewer.
  const [students, { data: records }, prevRows] = await Promise.all([
    teacherRoster(),
    db
      .from("attendance")
      .select("student_id, present, absence_reason, strike_id")
      .eq("class_id", mine.id)
      .eq("session_date", sessionDate)
      .eq("session_type", sessionType),
    // A count, not the rows — whether it was taken at all is the whole
    // question, and `head: true` sends no body back for it.
    prevDue
      ? db
          .from("attendance")
          .select("student_id", { count: "exact", head: true })
          .eq("class_id", mine.id)
          .eq("session_date", prevDue)
          .eq("session_type", sessionTypeFor(prevDue, timetable)!)
      : Promise.resolve({ count: null }),
  ]);

  const prevUnmarked = prevDue && (prevRows.count ?? 0) === 0 ? prevDue : null;

  return (
    <>
      <header className="masthead">
        <div>
          <h1><span>Attendance</span></h1>
          {/* The date names the session — once the class and the date are
              known there is no separate tajweed / hifdh choice to make. The
              subject is spelled out because the weekday no longer implies it:
              a Monday is tajweed for the brothers and hifdh for the sisters. */}
          <p>
            {mine.name} · {sessionLabel(sessionType)} · {longDate(sessionDate)}
            {sessionDate === today ? " · today" : sessionDate > today ? " · next lesson" : ""}
          </p>
        </div>

        <SessionCalendar
          value={sessionDate}
          today={today}
          basePath="/teacher/attendance"
          timetable={timetable}
        />
      </header>

      {prevUnmarked && (
        <Link
          href={`/teacher/attendance?date=${prevUnmarked}`}
          className="flex items-center justify-between gap-3 rounded-lg border border-warn/30 bg-warn/8 px-4 py-3 text-sm transition-colors hover:bg-warn/12"
        >
          <span className="min-w-0">
            <span className="font-medium text-warn">No register taken</span>
            <span className="text-muted-foreground"> · {longDate(prevUnmarked)}</span>
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">Open it →</span>
        </Link>
      )}

      <AttendanceRegister
        classId={mine.id}
        termId={termId}
        sessionDate={sessionDate}
        sessionType={sessionType}
        students={students}
        records={records ?? []}
      />

      <p className="text-xs text-muted-foreground">
        A strike here is your call, never automatic. Marking someone present
        again removes any strike that came with their absence.
      </p>
    </>
  );
}
