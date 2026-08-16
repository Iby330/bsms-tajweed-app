import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import { getTermsAndWeeks } from "@/lib/dashboard/queries";
import { getCachedSurahs } from "@/lib/reference/cached";
import { expectedPassed, memorisationList, type Surah } from "@/lib/hifz/pace";
import { PaceMarker } from "@/components/app/pace-marker";
import { HifzMarker } from "@/components/app/hifz-marker";
import { HifzTabs } from "@/components/app/hifz-tabs";
import { ReviewFeedback } from "@/components/app/review-feedback";

export const dynamic = "force-dynamic";

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
    db.from("profiles").select("full_name, class_id").eq("id", studentId).maybeSingle(),
    db.from("hifz_profiles").select("start_surah, target_count").eq("student_id", studentId).maybeSingle(),
    getCachedSurahs(),
    db.from("hifz_records").select("surah_number, teacher_comment").eq("student_id", studentId),
  ]);
  if (!student) notFound();

  const target = hp?.target_count ?? 43;
  const list = memorisationList(hp?.start_surah ?? 114, target, surahs as Surah[]);
  const recMap = new Map((records ?? []).map((r) => [r.surah_number, r]));
  const passed = recMap.size;
  const expected = expectedPassed(new Date(), weeks, target);
  const review = tab === "review";

  return (
    <>
      <header className="masthead">
        <Link href="/teacher/hifz" className="backstep">
          <ArrowLeft className="size-[13px]" aria-hidden />
          Hifdh register
        </Link>
        <h1><b>{student.full_name}</b></h1>
      </header>

      <HifzTabs basePath={`/teacher/hifz/${studentId}`} active={review ? "review" : "overview"} />

      {review ? (
        <ReviewFeedback
          studentId={studentId}
          heat={heat ? Number(heat) : undefined}
          basePath={`/teacher/hifz/${studentId}?tab=review`}
        />
      ) : (
        <>
          <div className="box c12">
            <PaceMarker passed={passed} expected={expected} target={target} />
          </div>

          <HifzMarker
            studentId={studentId}
            rows={list.map((s) => ({
              number: s.number,
              name_en: s.name_en,
              name_ar: s.name_ar,
              passed: recMap.has(s.number),
              comment: recMap.get(s.number)?.teacher_comment ?? null,
            }))}
          />
        </>
      )}
    </>
  );
}
