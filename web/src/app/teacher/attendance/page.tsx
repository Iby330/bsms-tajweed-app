import Link from "next/link";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { getTermsAndWeeks, currentTermId } from "@/lib/dashboard/queries";
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
  const { class: classParam, date: dateParam, session: sessionParam } = await searchParams;
  const profile = (await currentProfile())!;
  const db = await supabaseServer();

  const today = isoDate(new Date());
  const sessionDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam ?? "") ? dateParam! : today;
  const sessionType: SessionType =
    sessionParam === "monday" || sessionParam === "thursday"
      ? sessionParam
      : defaultSessionFor(sessionDate);

  const { terms } = await getTermsAndWeeks();
  const termId = currentTermId(terms, new Date(`${sessionDate}T12:00:00`));

  const { data: classes } = await db
    .from("classes").select("id, name, section").order("section").order("name");
  const mine =
    (classes ?? []).find((c) => c.id === classParam) ??
    (await db.from("classes").select("id, name, section").eq("teacher_id", profile.id).maybeSingle()).data ??
    classes?.[0];

  if (!mine) {
    return <p className="text-sm text-muted-foreground">No classes yet.</p>;
  }

  const { data: students } = await db
    .from("profiles")
    .select("id, full_name")
    .eq("class_id", mine.id)
    .eq("role", "student")
    .eq("is_active", true)
    .order("full_name");

  const { data: records } = await db
    .from("attendance")
    .select("student_id, present, absence_reason, strike_id")
    .eq("session_date", sessionDate)
    .eq("session_type", sessionType)
    .in("student_id", (students ?? []).map((s) => s.id).length ? (students ?? []).map((s) => s.id) : ["00000000-0000-0000-0000-000000000000"]);

  const href = (next: { class?: string; date?: string; session?: string }) => {
    const p = new URLSearchParams({
      class: next.class ?? mine.id,
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
            {sessionLabel(sessionType)} session ·{" "}
            {new Date(`${sessionDate}T12:00:00`).toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
            {sessionDate === today && " · today"}
          </p>
        </div>

        <nav className="flex flex-wrap gap-1.5">
          {(classes ?? []).map((c) => (
            <Link
              key={c.id}
              href={href({ class: c.id })}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs transition-colors",
                c.id === mine.id ? "border-ink bg-ink text-primary-foreground" : "border-line hover:bg-muted",
              )}
            >
              {c.name}
            </Link>
          ))}
        </nav>

        <div className="flex flex-wrap items-center gap-2">
          <form action="/teacher/attendance" className="flex items-center gap-2">
            <input type="hidden" name="class" value={mine.id} />
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
        students={students ?? []}
        records={records ?? []}
      />

      <p className="text-xs text-muted-foreground">
        A strike here is your call, never automatic. Marking someone present
        again removes any strike that came with their absence.
      </p>
    </div>
  );
}
