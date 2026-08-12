import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { getTermsAndWeeks } from "@/lib/dashboard/queries";
import { expectedPassed, memorisationList, type Surah } from "@/lib/hifz/pace";
import { PaceMarker } from "@/components/app/pace-marker";
import { HifzMarker } from "@/components/app/hifz-marker";

export const dynamic = "force-dynamic";

export default async function StudentHifzDetail({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const db = await supabaseServer();
  const { weeks } = await getTermsAndWeeks();

  const { data: student } = await db
    .from("profiles").select("full_name, class_id").eq("id", studentId).maybeSingle();
  if (!student) notFound();

  const [{ data: hp }, { data: surahs }, { data: records }] = await Promise.all([
    db.from("hifz_profiles").select("start_surah, target_count").eq("student_id", studentId).maybeSingle(),
    db.from("surahs").select("number, order_index, name_ar, name_en").order("order_index"),
    db.from("hifz_records").select("surah_number, teacher_comment").eq("student_id", studentId),
  ]);

  const target = hp?.target_count ?? 43;
  const list = memorisationList(hp?.start_surah ?? 114, target, (surahs ?? []) as Surah[]);
  const recMap = new Map((records ?? []).map((r) => [r.surah_number, r]));
  const passed = recMap.size;
  const expected = expectedPassed(new Date(), weeks, target);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link href="/teacher/hifz" className="text-xs text-muted-foreground underline underline-offset-4">
          ← Hifz register
        </Link>
        <h1 className="text-2xl">{student.full_name}</h1>
      </header>

      <div className="glass rounded-2xl p-4">
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
    </div>
  );
}
