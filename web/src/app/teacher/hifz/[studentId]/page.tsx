import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import { getTermsAndWeeks } from "@/lib/dashboard/queries";
import { getCachedSurahs } from "@/lib/reference/cached";
import { expectedPassed, paceStatus, memorisationList, type Surah } from "@/lib/hifz/pace";
import { HifzGrid, type MarkRow } from "@/components/app/hifz-grid";
import { HifzTabs } from "@/components/app/hifz-tabs";
import { ReviewFeedback } from "@/components/app/review-feedback";
import { Rule } from "@/components/app/rule";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PACE_LABEL = { ok: "Ahead", warn: "On pace", danger: "Behind" } as const;

/**
 * One student's hifdh, as the marking grid.
 *
 * This is deliberately the student's own view of their year — the mushaf index,
 * banded by hizb — rather than a teacher-shaped list of rows. Both people end
 * up looking at the same shape, which matters on a Thursday when they are
 * looking at it together, and the run reads as a run instead of forty-odd
 * lines. Marking hangs off the cells; see HifzGrid.
 */
export default async function StudentHifzDetail({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ tab?: string; heat?: string }>;
}) {
  const [{ studentId }, { tab, heat }] = await Promise.all([params, searchParams]);
  const db = await supabaseServer();

  // Every read here is keyed on the student id alone, the guard included — it
  // decides whether to render, not what to fetch, so it goes out with the rest.
  const [{ weeks }, { data: student }, { data: hp }, surahs, { data: records }] = await Promise.all([
    getTermsAndWeeks(),
    db
      .from("profiles")
      .select("full_name, class_id, classes!profiles_class_id_fkey(name)")
      .eq("id", studentId)
      .maybeSingle(),
    db.from("hifz_profiles").select("start_surah, target_count").eq("student_id", studentId).maybeSingle(),
    getCachedSurahs(),
    db
      .from("hifz_records")
      .select("surah_number, teacher_comment, passed_at")
      .eq("student_id", studentId),
  ]);
  if (!student) notFound();

  const review = tab === "review";
  const className = student.classes?.name ?? null;

  // The masthead and the tabs stay identical across both tabs, so Review is
  // reachable — and looks like the same page — before a target exists.
  const shell = (body: ReactNode) => (
    <>
      <header className="masthead">
        <Link href="/teacher/hifz" className="backstep">
          <ArrowLeft className="size-[13px]" aria-hidden />
          Hifdh register
        </Link>
        <h1>
          <b>{student.full_name}</b>
        </h1>
        <p>{className ? `${className} · Thursday recitation` : "Thursday recitation"}</p>
      </header>

      <HifzTabs basePath={`/teacher/hifz/${studentId}`} active={review ? "review" : "overview"} />

      {body}
    </>
  );

  if (review) {
    return shell(
      <>
        <Rule label="Peer revision" />
        <ReviewFeedback
          studentId={studentId}
          heat={heat ? Number(heat) : undefined}
          basePath={`/teacher/hifz/${studentId}?tab=review`}
        />
      </>,
    );
  }

  const all = surahs as Surah[];
  const list = hp ? memorisationList(hp.start_surah, hp.target_count, all) : [];
  if (list.length === 0) {
    return shell(
      <>
        <Rule label="The run" />
        <div className="field">
          <p className="box c12 note">
            No target set yet — choose one on the{" "}
            <Link href="/teacher/hifz" className="underline">
              register
            </Link>{" "}
            and this student’s run appears here.
          </p>
        </div>
      </>,
    );
  }

  const recMap = new Map((records ?? []).map((r) => [r.surah_number, r]));
  const rows: MarkRow[] = list.map((s) => {
    const rec = recMap.get(s.number);
    return {
      number: s.number,
      name_en: s.name_en,
      name_ar: s.name_ar,
      passed: Boolean(rec),
      comment: rec?.teacher_comment ?? null,
      passedAt: rec?.passed_at ?? null,
    };
  });

  // Counted over the run, not over the record: hifz_records is lifetime, so a
  // returning student's earlier years would otherwise inflate this year's work.
  const passed = rows.filter((r) => r.passed).length;
  const target = list.length;
  const expected = expectedPassed(new Date(), weeks, target);
  const complete = passed === target;
  const pace = !complete && expected > 0 ? paceStatus(passed, expected) : null;
  const next = rows.find((r) => !r.passed);
  const commented = rows.filter((r) => r.comment).length;

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
              {complete ? "—" : pace ? PACE_LABEL[pace] : "not yet"}
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
    </>,
  );
}
