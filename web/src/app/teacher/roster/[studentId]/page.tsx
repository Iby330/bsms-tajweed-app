import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import {
  getFullProgress,
  getIndividualLeaderboard,
  getTermsAndWeeks,
  currentTermId,
} from "@/lib/dashboard/queries";
import { getCachedSurahs } from "@/lib/reference/cached";
import { teacherClass } from "@/lib/teacher/scope";
import { expectedPassed } from "@/lib/hifz/pace";
import { TermBars } from "@/components/app/term-bars";
import { PaceMarker } from "@/components/app/pace-marker";
import { ExamInput } from "@/components/app/exam-input";
import { StrikeDots, REASON_LABELS } from "@/components/app/strike-dots";
import { StrikeManager, type StudentStrike } from "@/components/app/strike-manager";
import { MixedText } from "@/components/app/mixed-text";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const pct = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `${n.toFixed(1)}%`;

/** `passed_at` is a timestamptz, so it renders in the reader's own zone. */
function on(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  return Number.isNaN(ms)
    ? ""
    : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(ms));
}

/**
 * One student, whole.
 *
 * The roster carries five facts per student; everything else the year has
 * recorded about them is here — the three terms broken into their parts,
 * every marked homework as a series, the hifdh run with its comments, and
 * the strike record. Exam entry lives here too rather than on the roster:
 * typing a mark into a row of twenty is how marks land against the wrong
 * name, and here the student's name is at the top of the page.
 */
export default async function StudentRecord({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const db = await supabaseServer();

  // Every read is keyed on the student id or on nothing at all, the class
  // guard included — it decides whether to render, not what to fetch.
  const [
    { terms, weeks },
    mine,
    { data: student },
    full,
    lb,
    { data: hwPct },
    { data: homeworks },
    { data: strikeRows },
    surahs,
    { data: records },
  ] = await Promise.all([
    getTermsAndWeeks(),
    teacherClass(),
    db.from("profiles").select("full_name, class_id, is_active").eq("id", studentId).maybeSingle(),
    getFullProgress(studentId),
    getIndividualLeaderboard(),
    db.from("v_hw_pct").select("number, pct, term_id").eq("student_id", studentId),
    db.from("homeworks").select("number, title, series").order("number"),
    db.from("strikes").select("id, term_id, reason, note, issued_at").eq("student_id", studentId).order("issued_at"),
    getCachedSurahs(),
    db.from("hifz_records").select("surah_number, teacher_comment, passed_at").eq("student_id", studentId).order("passed_at"),
  ]);

  if (!student) notFound();
  // A teacher with a class of their own sees only their own students. This is
  // the same usability scoping the roster applies, not a security boundary —
  // RLS remains the thing that actually decides.
  if (mine && student.class_id !== mine.id) notFound();

  const termId = currentTermId(terms);
  const rank = lb.find((r) => r.name === student.full_name);

  const title = new Map(
    (homeworks ?? []).map((h) => [h.number, `${h.series === "tfp" ? "TFP" : "Homework"} ${h.number > 100 ? h.number - 100 : h.number} · ${h.title}`]),
  );
  const marks = (hwPct ?? [])
    .filter((r) => r.number !== null && r.pct !== null)
    .map((r) => ({ number: r.number!, pct: Number(r.pct), termId: r.term_id }))
    .sort((a, b) => a.number - b.number);

  const surahName = new Map(surahs.map((s) => [s.number, s]));
  const comments = (records ?? []).filter((r) => r.teacher_comment?.trim());

  // The current term's strikes are the ones that count towards removal;
  // earlier terms are history and are shown as such.
  const thisTerm: StudentStrike[] = (strikeRows ?? [])
    .filter((s) => s.term_id === termId)
    .map((s) => ({ id: s.id, reason: s.reason, note: s.note, issued_at: s.issued_at! }));
  const earlier = (strikeRows ?? []).filter((s) => s.term_id !== termId);

  const expected = expectedPassed(new Date(), weeks, full.hifz?.target ?? 43);

  return (
    <>
      <header className="masthead">
        <Link href="/teacher/roster" className="backstep">
          <ArrowLeft className="size-[13px]" aria-hidden />
          Back to Roster
        </Link>
        <h1><b>{student.full_name}</b></h1>
        <p>
          {mine?.name ?? "All classes"}
          {rank ? ` · ${rank.rank} of ${lb.length} overall` : ""}
          {!student.is_active && " · no longer enrolled"}
        </p>
      </header>

      {/* — the headline figures — */}
      <div className="field">
        <div className="box c3">
          <span className="label">Overall · year to date</span>
          <div className="stat">
            <span className="v sm">{full.eoyPct === null ? "—" : full.eoyPct.toFixed(1)}</span>
            {full.eoyPct !== null && <span className="u">%</span>}
          </div>
          <p className="note">80% exam, 20% homework</p>
        </div>

        <div className="box c3">
          <span className="label">Rank in the year</span>
          <div className="stat">
            <span className="v sm">{rank?.rank ?? "—"}</span>
            {rank && <span className="u">of {lb.length}</span>}
          </div>
          <p className="note">{rank?.classRank ? `${rank.classRank} in class` : "not ranked yet"}</p>
        </div>

        <div className="box c3">
          <span className="label">Hifdh signed off</span>
          <div className="stat">
            <span className="v sm">{full.hifz?.passed ?? 0}</span>
            <span className="u">of {full.hifz?.target ?? 43}</span>
          </div>
          <p className="note">{expected} expected by now</p>
        </div>

        <div className="box c3">
          <span className="label">Strikes · Term {termId}</span>
          <div className="stat">
            <span className={cn("v sm", thisTerm.length >= 2 && "text-danger")}>
              {thisTerm.length}
            </span>
            <span className="u">of 3</span>
          </div>
          <p className="note">{earlier.length ? `${earlier.length} in earlier terms` : "none earlier"}</p>
        </div>
      </div>

      <div className="divider"><span className="r" /><span className="m" /><span className="r" /></div>

      {/* — the year, term by term — */}
      <div className="field">
        <div className="box c5">
          <span className="label">The year</span>
          <TermBars terms={full.terms} currentTermId={termId} />
        </div>

        <div className="box c7" style={{ padding: 0 }}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Term</th>
                  <th className="px-2 py-2.5 text-right font-medium">Homework</th>
                  <th className="px-2 py-2.5 text-right font-medium">Exam</th>
                  <th className="px-4 py-2.5 text-right font-medium">Term %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {full.terms.map((t) => (
                  <tr key={t.termId} className={cn(t.termId === termId && "bg-foreground/4")}>
                    <td className="px-4 py-2.5 font-medium">
                      Term {t.termId}
                      {t.termId === termId && <span className="label ml-2">current</span>}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{pct(t.hwAvg)}</td>
                    <td className="px-2 py-2.5">
                      <span className="flex justify-end">
                        <ExamInput
                          studentId={studentId}
                          termId={t.termId}
                          max={t.examMax}
                          initial={t.examScore}
                        />
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                      {pct(t.termPct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 pb-4 text-xs text-muted-foreground">
            Exam marks save when you click away from the box. Unsubmitted homework is excluded
            from the average, not counted as zero.
          </p>
        </div>
      </div>

      {/* — every marked homework, in order — */}
      <div className="field" style={{ marginTop: 1 }}>
        <div className="box c12">
          <span className="label">Homework · every mark this year</span>
          {marks.length ? (
            <>
              <div className="flex h-32 items-end gap-[3px]" role="img"
                aria-label={`${marks.length} marked homeworks, averaging ${(marks.reduce((a, m) => a + m.pct, 0) / marks.length).toFixed(1)} per cent`}>
                {marks.map((m) => (
                  <span
                    key={m.number}
                    className={cn(
                      "min-w-0 flex-1 rounded-t-sm transition-colors",
                      m.pct >= 80 ? "bg-viz-hw" : m.pct >= 50 ? "bg-warn/70" : "bg-danger/70",
                    )}
                    style={{ height: `${Math.max(m.pct, 2)}%` }}
                    data-tip={title.get(m.number) ?? `Homework ${m.number}`}
                    data-tip-value={`${m.pct.toFixed(1)}%`}
                  />
                ))}
              </div>
              <p className="note">
                {marks.length} marked · average {(marks.reduce((a, m) => a + m.pct, 0) / marks.length).toFixed(1)}%
                {" · "}best {Math.max(...marks.map((m) => m.pct)).toFixed(1)}%
                {" · "}lowest {Math.min(...marks.map((m) => m.pct)).toFixed(1)}%
              </p>
            </>
          ) : (
            <p className="empty">Nothing marked yet.</p>
          )}
        </div>
      </div>

      {/* — hifdh, and what was said about it — */}
      <div className="field" style={{ marginTop: 1 }}>
        <div className="box c6">
          <span className="label">Hifdh</span>
          <PaceMarker
            passed={full.hifz?.passed ?? 0}
            expected={expected}
            target={full.hifz?.target ?? 43}
          />
          <Link href={`/teacher/hifz/${studentId}`} className="backstep" style={{ marginTop: 4 }}>
            Open the register to sign a surah off
          </Link>
        </div>

        <div className="box c6">
          <span className="label">Comments left on the register</span>
          {comments.length ? (
            <ul className="divide-y divide-line">
              {comments.map((c) => {
                const s = surahName.get(c.surah_number);
                return (
                  <li key={c.surah_number} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="flex min-w-0 items-baseline gap-2 text-sm font-medium">
                        <span className="truncate">{s?.name_en ?? `Surah ${c.surah_number}`}</span>
                        {s && (
                          <span dir="rtl" lang="ar" className="ar-quran shrink-0 text-ok">
                            {s.name_ar}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {on(c.passed_at)}
                      </span>
                    </div>
                    {/* A teacher's own words, so they are set as prose — the
                        mono meta style the rest of the rows use is for
                        figures, and turns a sentence into shouting. */}
                    <p className="mt-1 text-sm leading-relaxed text-ink-2">
                      <MixedText text={c.teacher_comment!} />
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="empty">No comments yet.</p>
          )}
        </div>
      </div>

      {/* — the strike record — */}
      <div className="field" style={{ marginTop: 1 }}>
        <StrikeDots strikes={thisTerm} />

        <div className="box c8">
          <span className="label">Issue or withdraw a strike</span>
          <div>
            <StrikeManager
              studentId={studentId}
              studentName={student.full_name}
              termId={termId}
              strikes={thisTerm}
            />
          </div>
          {earlier.length > 0 && (
            <>
              <p className="label">Earlier terms · history only</p>
              <ul className="divide-y divide-line">
                {earlier.map((s) => (
                  <li key={s.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium">
                        {REASON_LABELS[s.reason] ?? s.reason}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        Term {s.term_id} · {on(s.issued_at)}
                      </span>
                    </div>
                    {s.note && (
                      <p className="mt-1 text-sm leading-relaxed text-ink-2">{s.note}</p>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </>
  );
}
