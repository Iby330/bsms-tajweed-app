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
} from "@/lib/attendance/calendar";
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
  // taught: a Tuesday or Wednesday resolves forward to Thursday, a Friday
  // through Sunday to Monday, and a lesson day is itself. That is the register
  // the teacher is walking into a room to take.
  //
  // A hand-typed ?date= is snapped BACKWARDS to a real lesson day instead —
  // it is a date they chose, and resolving it forward would answer a question
  // they did not ask by quietly moving them to the following session.
  const today = isoDate(new Date());
  const sessionDate = dateParam ? nearestSessionDate(dateParam) : nextSessionDate(today);
  const sessionType = sessionTypeFor(sessionDate)!;

  const [{ terms }, mine] = await Promise.all([getTermsAndWeeks(), teacherClass()]);
  const termId = currentTermId(terms, new Date(`${sessionDate}T12:00:00`));

  if (!mine) {
    return (
      <p className="empty">
        You have no class assigned yet.
      </p>
    );
  }

  // Opening on the NEXT lesson means the last one is off screen, and a
  // register nobody filled in is silent on its own — the failure mode is a
  // Monday that quietly never got taken. Only a session that has actually
  // happened is worth asking about, so anything still in the future is
  // skipped, as is the year's first session, which has nothing behind it.
  const prev = previousSessionDate(sessionDate);
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
          .eq("session_type", sessionTypeFor(prevDue)!)
      : Promise.resolve({ count: null }),
  ]);

  const prevUnmarked = prevDue && (prevRows.count ?? 0) === 0 ? prevDue : null;

  return (
    <>
      <header className="masthead">
        <div>
          <h1><span>Attendance</span></h1>
          {/* The weekday names the session — there is no separate Monday /
              Thursday choice to make once the date is a lesson date. */}
          <p>
            {mine.name} · {longDate(sessionDate)}
            {sessionDate === today ? " · today" : sessionDate > today ? " · next lesson" : ""}
          </p>
        </div>

        <SessionCalendar value={sessionDate} today={today} basePath="/teacher/attendance" />
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
