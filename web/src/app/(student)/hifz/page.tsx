import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { getTermsAndWeeks } from "@/lib/dashboard/queries";
import { expectedPassed, paceStatus, memorisationList, type Surah } from "@/lib/hifz/pace";
import { assumedPassed, checkStatus, hizbBlocks, juzProgress } from "@/lib/hifz/hizb";
import { SURAH_META } from "@/lib/hifz/surah-meta";
import { HifzHero } from "@/components/app/hifz-hero";
import { HifzJourney } from "@/components/app/hifz-journey";
import { HifzRecord, type RecordEntry } from "@/components/app/hifz-record";

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

  const all = (surahs ?? []) as Surah[];
  if (all.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-card p-8 text-center">
        <h1 className="text-xl">Hifz</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The surah list couldn&apos;t be loaded — please try again shortly.
        </p>
      </div>
    );
  }

  const list = memorisationList(hp.start_surah, hp.target_count, all);
  const recordMap = new Map(
    (records ?? []).map((r) => [
      r.surah_number,
      { passed_at: r.passed_at, teacher_comment: r.teacher_comment },
    ]),
  );
  const passedSet = new Set(recordMap.keys());

  // Derived numbers all use the assumed set so a returning student's earlier
  // years count; the path itself only ever shows this year's list.
  const assumed = assumedPassed(all, list, passedSet);
  const blocks = hizbBlocks(all, assumed);
  // passedSet, not assumed: last year's hizb check doesn't need redoing
  const check = checkStatus(blocks, passedSet);
  const juz = juzProgress(all, list, assumed);

  const passedCount = list.filter((s) => passedSet.has(s.number)).length;
  const expected = expectedPassed(new Date(), weeks, hp.target_count);
  const pace = expected > 0 ? paceStatus(passedCount, expected) : null;
  const current = list.find((s) => !passedSet.has(s.number)) ?? list[list.length - 1];
  const complete = passedCount === list.length && list.length > 0;

  const byNumber = new Map(all.map((s) => [s.number, s]));
  const entries: RecordEntry[] = (records ?? [])
    .map((r) => {
      const s = byNumber.get(r.surah_number);
      return s
        ? {
            number: s.number,
            name_en: s.name_en,
            name_ar: s.name_ar,
            passed_at: r.passed_at,
            teacher_comment: r.teacher_comment,
            order_index: s.order_index,
          }
        : null;
    })
    .filter((e): e is RecordEntry & { order_index: number } => e !== null)
    .sort((a, b) =>
      a.passed_at === b.passed_at
        ? b.order_index - a.order_index // same Thursday: further along = later
        : b.passed_at.localeCompare(a.passed_at),
    );

  return (
    <div className="max-w-2xl space-y-5">
      <header>
        <h1 className="text-2xl">Hifz</h1>
      </header>

      <HifzHero
        nameEn={current?.name_en ?? ""}
        nameAr={current?.name_ar ?? ""}
        meta={current ? SURAH_META[current.number] : undefined}
        juz={juz}
        blocks={blocks}
        pace={pace}
        complete={complete}
        check={check}
      />

      <HifzJourney list={list} records={recordMap} expected={expected} />

      <HifzRecord entries={entries} />
    </div>
  );
}
