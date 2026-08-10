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
    <section className="rounded-lg border border-line bg-card p-5" aria-label="Hifz overview">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {complete ? "Memorisation target complete" : "Now memorising"}
          </p>
          <p className="mt-1 text-3xl">
            <span dir="rtl" lang="ar" className="ar-ui">{nameAr}</span>
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
              className="grid size-14 shrink-0 place-items-center rounded-full ring-1 ring-line"
              style={{ background: `conic-gradient(var(--ok) ${pct}%, var(--muted) 0)` }}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={juz.total}
              aria-valuenow={juz.passed}
              aria-label={`${juz.name_en}: ${juz.passed} of ${juz.total} surahs`}
            >
              <div
                className={cn(
                  "grid size-11 place-items-center rounded-full bg-card text-[11px] font-medium tabular-nums",
                  pct === 0 ? "text-muted-foreground" : "text-ok",
                )}
              >
                {juz.passed}/{juz.total}
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {juz.name_en}{" "}
                <span dir="rtl" lang="ar" className="ar-ui normal-case tracking-normal">
                  {juz.name_ar}
                </span>
              </p>
              <p className="text-sm">
                <span className="font-medium tabular-nums">
                  {juz.passed} of {juz.total}
                </span>{" "}
                surahs
              </p>
              {/* pace lives inside the juz block: juz is null only when the list
                  is empty, in which case expected=0 forces pace null anyway */}
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
            <div
              className="h-2.5 overflow-hidden rounded-full bg-muted ring-1 ring-inset ring-line"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={b.surahs.length}
              aria-valuenow={b.passedCount}
              aria-label={`Hizb ${b.hizb}: ${b.passedCount} of ${b.surahs.length} surahs`}
            >
              <div
                className="h-full rounded-full bg-ok"
                style={{ width: `${b.surahs.length ? (b.passedCount / b.surahs.length) * 100 : 0}%` }}
              />
            </div>
            <p className="mt-1 truncate text-[10px] tabular-nums text-muted-foreground">
              <span className="hidden sm:inline">Hizb </span>
              {b.hizb} · {b.passedCount}/{b.surahs.length}
            </p>
          </div>
        ))}
      </div>

      {/* Completion is celebrated by the journey's terminal card, and the
          label above already reads "Memorisation target complete" — the
          footer keeps only actionable lines. A boundary-aligned target can
          be BOTH complete and ready for its hizb check, so `ready` renders
          regardless of `complete`. */}
      {check?.kind === "ready" && (
        <p className="mt-3 text-sm font-medium text-warn">
          Ready for your Hizb {check.hizb} check <span aria-hidden>◆</span>
        </p>
      )}
      {!complete && check?.kind === "toGo" && (
        <p className="mt-3 text-sm">
          <span className="font-medium tabular-nums">
            {check.remaining} surah{check.remaining === 1 ? "" : "s"}
          </span>{" "}
          until your <span className="font-medium">Hizb {check.hizb} check</span> — presenting
          the whole hizb to your teacher.
        </p>
      )}
    </section>
  );
}
