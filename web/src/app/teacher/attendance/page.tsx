import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { getTermsAndWeeks, currentTermId } from "@/lib/dashboard/queries";
import { teacherClass, teacherRoster } from "@/lib/teacher/scope";
import {
  defaultSessionFor,
  isoDate,
  sessionLabel,
  type SessionType,
} from "@/lib/attendance/session";
import { AttendanceRegister } from "@/components/app/attendance-register";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function Attendance({
  searchParams,
}: {
  searchParams: Promise<{ class?: string; date?: string; session?: string }>;
}) {
  const { date: dateParam, session: sessionParam } = await searchParams;
  const db = await supabaseServer();

  const today = isoDate(new Date());
  const sessionDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam ?? "") ? dateParam! : today;
  const sessionType: SessionType =
    sessionParam === "monday" || sessionParam === "thursday"
      ? sessionParam
      : defaultSessionFor(sessionDate);

  const { terms } = await getTermsAndWeeks();
  const termId = currentTermId(terms, new Date(`${sessionDate}T12:00:00`));

  const mine = await teacherClass();
  if (!mine) {
    return (
      <p className="rounded-lg border border-line bg-card p-6 text-sm text-muted-foreground">
        You have no class assigned yet.
      </p>
    );
  }

  const students = await teacherRoster();
  const ids = students.map((s) => s.id);

  const { data: records } = ids.length
    ? await db
        .from("attendance")
        .select("student_id, present, absence_reason, strike_id")
        .eq("session_date", sessionDate)
        .eq("session_type", sessionType)
        .in("student_id", ids)
    : { data: [] };

  const href = (next: { date?: string; session?: string }) => {
    const p = new URLSearchParams({
      date: next.date ?? sessionDate,
      session: next.session ?? sessionType,
    });
    return `/teacher/attendance?${p}`;
  };

  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <div>
          <h1 className="text-2xl">Attendance</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mine.name} · {sessionLabel(sessionType)} session ·{" "}
            {new Date(`${sessionDate}T12:00:00`).toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
            {sessionDate === today && " · today"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <form action="/teacher/attendance" className="flex items-center gap-2">
            <input type="hidden" name="session" value={sessionType} />
            <input
              type="date"
              name="date"
              defaultValue={sessionDate}
              className="h-8 rounded-md border border-line bg-card px-2 text-xs"
            />
            <button
              type="submit"
              className="h-8 rounded-md border border-line px-2.5 text-xs transition-colors hover:bg-muted"
            >
              Go
            </button>
          </form>

          <div className="flex overflow-hidden rounded-md border border-line">
            {(["monday", "thursday"] as const).map((s) => (
              <Link
                key={s}
                href={href({ session: s })}
                className={cn(
                  "px-2.5 py-1.5 text-xs transition-colors",
                  s !== "monday" && "border-l border-line",
                  s === sessionType ? "bg-ink font-medium text-primary-foreground" : "hover:bg-muted",
                )}
              >
                {sessionLabel(s)}
              </Link>
            ))}
          </div>
        </div>
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
    </div>
  );
}
