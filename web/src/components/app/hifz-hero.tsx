import { cn } from "@/lib/utils";
import type { PaceStatus } from "@/lib/hifz/pace";
import type { CheckStatus, HizbBlock, JuzProgress } from "@/lib/hifz/hizb";

/** Top card of /hifz: current surah, juz-framed ring, hizb block bars, and
 *  the distance to the next hizb check. Everything is precomputed by the
 *  page; this only renders. */
export function HifzHero({
  nameEn,
  nameAr,
  meta,
  juz,
  blocks,
  pace,
  complete,
  check,
}: {
  nameEn: string;
  nameAr: string;
  meta?: { ayahs: number; meaning: string };
  juz: JuzProgress | null;
  blocks: HizbBlock[];
  pace: PaceStatus | null;
  complete: boolean; // the student's own list is fully passed
  check: CheckStatus;
}) {
  const pct = juz && juz.total > 0 ? Math.round((juz.passed / juz.total) * 100) : 0;
  return (
    <section className="rounded-lg border border-line bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {complete ? "Memorisation target complete" : "Now memorising"}
          </p>
          <p dir="rtl" lang="ar" className="ar-ui mt-1 text-3xl">
            {nameAr}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {nameEn}
            {meta && (
              <>
                {" "}· &ldquo;{meta.meaning}&rdquo; · {meta.ayahs} ayahs
              </>
            )}
          </p>
        </div>

        {juz && (
          <div className="flex items-center gap-3">
            <div
              className="grid size-14 shrink-0 place-items-center rounded-full"
              style={{ background: `conic-gradient(var(--ok) ${pct}%, var(--muted) 0)` }}
            >
              <div className="grid size-11 place-items-center rounded-full bg-card text-[11px] font-medium tabular-nums text-ok">
                {juz.passed}/{juz.total}
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {juz.name_en}{" "}
                <span dir="rtl" lang="ar" className="ar-ui normal-case">
                  {juz.name_ar}
                </span>
              </p>
              <p className="text-sm">
                <span className="font-medium tabular-nums">
                  {juz.passed} of {juz.total}
                </span>{" "}
                surahs
              </p>
              {pace && (
                <span
                  className={cn(
                    "inline-block rounded-md px-2 py-0.5 text-xs font-medium",
                    pace === "ok" && "bg-ok/12 text-ok",
                    pace === "warn" && "bg-warn/12 text-warn",
                    pace === "danger" && "bg-danger/12 text-danger",
                  )}
                >
                  {pace === "ok" ? "ahead of pace" : pace === "warn" ? "on pace" : "behind pace"}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* hizb blocks — widths proportional to surah counts (28/9/6) */}
      <div className="mt-5 flex gap-1.5">
        {blocks.map((b) => (
          <div key={b.hizb} className="min-w-0" style={{ flexGrow: b.surahs.length, flexBasis: 0 }}>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-ok"
                style={{ width: `${b.surahs.length ? (b.passedCount / b.surahs.length) * 100 : 0}%` }}
              />
            </div>
            <p
              className={cn(
                "mt-1 truncate text-[10px] tabular-nums",
                b.state === "upcoming" ? "text-muted-foreground/60" : "text-muted-foreground",
              )}
            >
              Hizb {b.hizb} ·{" "}
              {b.state === "upcoming" ? b.surahs.length : `${b.passedCount}/${b.surahs.length}`}
            </p>
          </div>
        ))}
      </div>

      {/* When the student's own list is done, celebrate — even if their target
          ends mid-hizb and the run's next check is technically still ahead.
          checkStatus's "done" kind is intentionally not rendered here: whenever
          it fires, `complete` is true and this branch wins. */}
      {complete ? (
        <p className="mt-3 text-sm font-medium text-ok">Target complete — masha&rsquo;Allah.</p>
      ) : (
        check && (
          <p className="mt-3 text-sm">
            {check.kind === "toGo" && (
              <>
                <span className="font-medium tabular-nums">
                  {check.remaining} surah{check.remaining === 1 ? "" : "s"}
                </span>{" "}
                until your <span className="font-medium">Hizb {check.hizb} check</span> — presenting
                the whole hizb to your teacher.
              </>
            )}
            {check.kind === "ready" && (
              <span className="font-medium text-warn">Ready for your Hizb {check.hizb} check ◆</span>
            )}
          </p>
        )
      )}
    </section>
  );
}
