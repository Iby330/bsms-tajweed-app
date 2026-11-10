"use client";

/**
 * One student's murāja'ah, for the teacher: back to the roster, prev/next
 * through it, four figures, the progress chart (judged by the preview
 * target, so the targets panel's edit shows here too) and the full history
 * (judged as each attempt was at the time).
 */
import { useMemo } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ProgressChart } from "@/components/murajaah/progress-chart";
import { SessionHistory } from "@/components/murajaah/session-history";
import { formatClock } from "@/lib/murajaah/bands";
import { useMurajaahTeacher } from "./murajaah-teacher";
import { Avatar, CustomTag, studentHref } from "./roster-table";
import { dateOf, studentStats } from "./roster-data";

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
const fmtDay = (iso: string) => DAY.format(new Date(iso));
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

function overrideText(o: { hizb: number | null; juz: number | null; surah10: number | null; note?: string | null }) {
  const parts = [
    o.hizb !== null && `hizb ≤ ${o.hizb}`,
    o.juz !== null && `juz ≤ ${o.juz}`,
    o.surah10 !== null && `≤ ${o.surah10} per 10 surah pages`,
  ].filter(Boolean);
  if (!parts.length && !o.note) return null;
  return `${parts.length ? `Custom limits: ${parts.join(", ")}` : "Note"}${o.note ? `${parts.length ? " " : ": "}${parts.length ? `(${o.note})` : o.note}` : ""}`;
}

export function StudentMurajaah({ studentId }: { studentId: string }) {
  const { students, sessions, preview, overrideFor, now } = useMurajaahTeacher();
  const idx = students.findIndex((s) => s.id === studentId);
  const student = students[idx];
  const override = overrideFor(studentId);
  const st = useMemo(
    () => (student ? studentStats(student, sessions, preview.target, override, now) : null),
    [student, sessions, preview.target, override, now],
  );
  if (!student || !st) return <p className="text-sm text-muted-foreground">That student is not in this class.</p>;

  const prev = students[(idx + students.length - 1) % students.length];
  const next = students[(idx + 1) % students.length];
  const L = st.last;
  const extra = override ? overrideText(override) : null;

  return (
    <section aria-labelledby="stu-h" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link href="/teacher/hifdh/murajaah" className={buttonVariants({ variant: "ghost" })}>
          <ChevronLeft /> All students
        </Link>
        {students.length > 1 && (
          <span className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground tabular-nums">{idx + 1} of {students.length}</span>
            <Link href={studentHref(prev.id)} className={buttonVariants({ variant: "outline", size: "icon" })} aria-label={`Previous student: ${prev.name}`}>
              <ChevronLeft />
            </Link>
            <Link href={studentHref(next.id)} className={buttonVariants({ variant: "outline", size: "icon" })} aria-label={`Next student: ${next.name}`}>
              <ChevronRight />
            </Link>
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Avatar name={student.name} className="size-11 text-sm" />
        <div className="min-w-0">
          <h2 id="stu-h" className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            {student.name}
            {st.hasOverride && <CustomTag />}
          </h2>
          <p className="text-sm text-muted-foreground">
            {plural(st.attempts.length, "attempt")}
            {L && <>, last on {fmtDay(dateOf(L))} ({L.label})</>}
            {extra && <> · {extra}</>}
          </p>
        </div>
      </div>

      <div className="field">
        <dl className="box c12 statstrip" data-facts>
          <div>
            <dt className="label">Last 7 days</dt>
            <dd className="fig"><span className="v">{st.weekTotal}</span><span className="u">{st.weekTotal === 1 ? "attempt" : "attempts"}</span></dd>
          </div>
          <div>
            <dt className="label">Best per hizb</dt>
            <dd className="fig">
              <span className="v">{st.best ? formatClock(st.best.ms) : "—"}</span>
              {st.best && <span className="u max-sm:hidden">{st.best.label}</span>}
            </dd>
          </div>
          <div>
            <dt className="label">Mistake limit met</dt>
            <dd className="fig"><span className="v">{st.met}</span><span className="u">of {st.attempts.length}</span></dd>
          </div>
          <div>
            <dt className="label">Not too slow</dt>
            <dd className="fig"><span className="v">{st.inTime}</span><span className="u">of {st.attempts.length}</span></dd>
          </div>
        </dl>
      </div>

      <ProgressChart sessions={st.attempts} target={preview.target} override={override} name={student.name} />

      <SessionHistory
        sessions={st.attempts}
        show="listener"
        emptyText={`No saved attempts yet. ${student.name.split(" ")[0]}'s revision shows here once a classmate logs it.`}
      />
    </section>
  );
}
