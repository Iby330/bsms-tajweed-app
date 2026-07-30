import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { getTermsAndWeeks } from "@/lib/dashboard/queries";
import { expectedPassed, memorisationList, type Surah } from "@/lib/hifz/pace";
import { PaceMarker } from "@/components/app/pace-marker";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function StudentHifz() {
  const profile = (await currentProfile())!;
  const db = await supabaseServer();
  const { weeks } = await getTermsAndWeeks();

  const [{ data: hp }, { data: surahs }, { data: records }] = await Promise.all([
    db.from("hifz_profiles").select("start_surah, target_count").eq("student_id", profile.id).maybeSingle(),
    db.from("surahs").select("number, order_index, name_ar, name_en").order("order_index"),
    db.from("hifz_records").select("surah_number, passed_at, teacher_comment").eq("student_id", profile.id),
  ]);

  if (!hp) {
    return (
      <div className="rounded-lg border border-line bg-card p-8 text-center">
        <h1 className="text-xl">Hifz</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your teacher hasn&apos;t set your memorisation target yet.
        </p>
      </div>
    );
  }

  const list = memorisationList(hp.start_surah, hp.target_count, (surahs ?? []) as Surah[]);
  const passedMap = new Map((records ?? []).map((r) => [r.surah_number, r]));
  const passed = passedMap.size;
  const expected = expectedPassed(new Date(), weeks, hp.target_count);
  const nextUp = list.find((s) => !passedMap.has(s.number));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl">Hifz</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {nextUp ? <>Currently on <span className="font-medium text-foreground">{nextUp.name_en}</span></> : "Target complete — masha'Allah."}
        </p>
      </header>

      <div className="rounded-lg border border-line bg-card p-4">
        <PaceMarker passed={passed} expected={expected} target={hp.target_count} />
      </div>

      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
        {list.map((s) => {
          const rec = passedMap.get(s.number);
          return (
            <li key={s.number} className="flex items-start gap-3 px-4 py-3">
              <span className={cn(
                "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[11px]",
                rec ? "bg-ok/15 text-ok" : "border border-line text-muted-foreground",
              )}>{rec ? "✓" : ""}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-sm font-medium">
                    {s.name_en}{" "}
                    <span dir="rtl" lang="ar" className="ar-ui text-muted-foreground">{s.name_ar}</span>
                  </span>
                  {rec && <span className="text-xs tabular-nums text-muted-foreground">{rec.passed_at}</span>}
                </div>
                {rec?.teacher_comment && (
                  <p className="mt-1 rounded-md bg-muted px-2.5 py-1.5 text-xs text-ink-2">
                    {rec.teacher_comment}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
