import { currentProfile, supabaseServer } from "@/lib/supabase/server";
import { getTermsAndWeeks } from "@/lib/dashboard/queries";
import { getCachedSurahs } from "@/lib/reference/cached";
import { expectedPassed, paceStatus, memorisationList, type Surah } from "@/lib/hifz/pace";
import { assumedPassed, checkStatus, hizbBlocks, juzProgress } from "@/lib/hifz/hizb";
import { SURAH_META } from "@/lib/hifz/surah-meta";
import { HifzHero } from "@/components/app/hifz-hero";
import { HifzJourney } from "@/components/app/hifz-journey";
import { HifzTabs } from "@/components/app/hifz-tabs";
import { ReviewTab } from "@/components/app/review-tab";

export const dynamic = "force-dynamic";

function EmptyState({ message }: { message: string }) {
  return (
    <div className="mx-auto max-w-2xl glass rounded-2xl p-8 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export default async function StudentHifz({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string; heat?: string }>;
}) {
  const { tab, page, heat } = await searchParams;
  const profile = (await currentProfile())!;

  // The Review tab must stay reachable even before a target is set — a
  // student with no run of their own can still review their partner.
  if (tab === "review") {
    return (
      <>
        <header className="masthead">
          <h1><span>Hifdh</span></h1>
          <p>Peer revision with your partner.</p>
        </header>
        <HifzTabs basePath="/hifz" active="review" />
        <ReviewTab userId={profile.id} pageParam={page} heatParam={heat} />
      </>
    );
  }

  const db = await supabaseServer();
  const { weeks } = await getTermsAndWeeks();

  const [{ data: hp }, surahs, { data: records }] = await Promise.all([
    db.from("hifz_profiles").select("start_surah, target_count").eq("student_id", profile.id).maybeSingle(),
    getCachedSurahs(),
    db.from("hifz_records").select("surah_number, passed_at, teacher_comment").eq("student_id", profile.id),
  ]);

  // Empty states keep the masthead and tabs — a student with no target of
  // their own still reaches Review to log their partner's recitation.
  const emptyShell = (message: string) => (
    <>
      <header className="masthead">
        <h1><span>Hifdh</span></h1>
        <p>Your memorisation journey.</p>
      </header>
      <HifzTabs basePath="/hifz" active="overview" />
      <EmptyState message={message} />
    </>
  );

  if (!hp) {
    return emptyShell("Your teacher hasn't set your memorisation target yet.");
  }

  const all = surahs as Surah[];
  if (all.length === 0) {
    return emptyShell("The surah list couldn't be loaded. Please try again shortly.");
  }

  const list = memorisationList(hp.start_surah, hp.target_count, all);
  if (list.length === 0) {
    return emptyShell("Your teacher hasn't set your memorisation target yet.");
  }
  const recordMap = new Map(
    (records ?? []).map((r) => [
      r.surah_number,
      { passed_at: r.passed_at, teacher_comment: r.teacher_comment },
    ]),
  );
  const passedSet = new Set(recordMap.keys());

  // hifz_records is lifetime (no year column); this year's work is exactly
  // the surahs on the student's current list. Everything the page shows —
  // check readiness AND the record — is year-scoped through this set.
  const listNumbers = new Set(list.map((s) => s.number));
  const earned = new Set([...passedSet].filter((n) => listNumbers.has(n)));

  // Derived numbers all use the assumed set so a returning student's earlier
  // years count; the path itself only ever shows this year's list.
  const assumed = assumedPassed(all, list, passedSet);
  const blocks = hizbBlocks(all, assumed);
  // earned, not assumed/lifetime: last year's hizb check doesn't need redoing
  const check = checkStatus(blocks, earned);
  const juz = juzProgress(all, list, assumed);

  const passedCount = list.filter((s) => passedSet.has(s.number)).length;
  const complete = passedCount === list.length;
  const expected = expectedPassed(new Date(), weeks, Math.min(hp.target_count, list.length));
  const pace = !complete && expected > 0 ? paceStatus(passedCount, expected) : null;
  // NB: "current" is also derived inside juzProgress (from assumed) and
  // HifzJourney (from records); all three agree because assumed only ever
  // adds surahs strictly before list[0].
  const current = list.find((s) => !passedSet.has(s.number)) ?? list[list.length - 1];

  // No separate record list any more: every passed surah carries its own
  // date and comment inside the index, so building a second, sorted copy of
  // the same rows was two places to read the same thing.
  return (
    <>
      <header className="masthead">
        <h1><span>Hifdh</span></h1>
        <p>Your memorisation journey.</p>
        <div className="meta">
          <span className="label">
            {passedCount} of {list.length} surahs
          </span>
          {!complete && expected > 0 && (
            <span className="label hi">
              {passedCount > expected
                ? `${passedCount - expected} ahead of pace`
                : passedCount < expected
                  ? `${expected - passedCount} behind pace`
                  : "on pace"}
            </span>
          )}
        </div>
      </header>

      <HifzTabs basePath="/hifz" active="overview" />

      <div className="divider">
        <span className="label">Where you are</span>
        <span className="r" />
        <span className="m" />
      </div>

      <div className="field">
        <HifzHero
          number={current?.number ?? null}
          nameEn={current?.name_en ?? ""}
          nameAr={current?.name_ar ?? ""}
          meta={current ? SURAH_META[current.number] : undefined}
          juz={juz}
          blocks={blocks}
          pace={pace}
          complete={complete}
          check={check}
        />
      </div>

      <div className="divider">
        <span className="label">The journey</span>
        <span className="r" />
        <span className="m" />
      </div>

      <div className="field">
        <HifzJourney list={list} records={recordMap} expected={expected} />
      </div>

      <div className="signoff">
        <span className="lines">{profile.classes?.name ?? "BSMS"}</span>
        <span className="wm" role="img" aria-label="BSMS Tajweed" />
        <span className="lines right">{passedCount} of {list.length}</span>
      </div>
    </>
  );
}
