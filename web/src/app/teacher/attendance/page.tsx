import { supabaseServer } from "@/lib/supabase/server";
import { getTermsAndWeeks, currentTermId } from "@/lib/dashboard/queries";
import { teacherClass, teacherRoster } from "@/lib/teacher/scope";
import { isoDate } from "@/lib/attendance/session";
import { nearestSessionDate, sessionTypeFor } from "@/lib/attendance/calendar";
import { AttendanceRegister } from "@/components/app/attendance-register";
import { SessionCalendar } from "@/components/app/session-calendar";

export const dynamic = "force-dynamic";

export default async function Attendance({
  searchParams,
}: {
  searchParams: Promise<{ class?: string; date?: string }>;
}) {
  const { date: dateParam } = await searchParams;
  const db = await supabaseServer();

  // A hand-typed ?date= is snapped to a real lesson day rather than refused —
  // the register has to open on something, and the nearest session is what the
  // teacher was reaching for. The session is then read off the date: only
  // Mondays and Thursdays get this far, so it is never ambiguous.
  const today = isoDate(new Date());
  const sessionDate = nearestSessionDate(dateParam ?? today);
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

  // The register stamps every row it writes with this class, so the session
  // can be read by class rather than waiting on the roster to name its
  // students. The rows are the same either way; the round trips are one fewer.
  const [students, { data: records }] = await Promise.all([
    teacherRoster(),
    db
      .from("attendance")
      .select("student_id, present, absence_reason, strike_id")
      .eq("class_id", mine.id)
      .eq("session_date", sessionDate)
      .eq("session_type", sessionType),
  ]);

  return (
    <>
      <header className="masthead">
        <div>
          <h1><span>Attendance</span></h1>
          {/* The weekday names the session — there is no separate Monday /
              Thursday choice to make once the date is a lesson date. */}
          <p>
            {mine.name} ·{" "}
            {new Date(`${sessionDate}T12:00:00`).toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
            {sessionDate === today && " · today"}
          </p>
        </div>

        <SessionCalendar value={sessionDate} today={today} basePath="/teacher/attendance" />
      </header>

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
