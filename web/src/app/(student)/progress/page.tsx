import Link from "next/link";
import { currentProfile } from "@/lib/supabase/server";
import { getTermsAndWeeks, currentTermId, getFullProgress } from "@/lib/dashboard/queries";
import { getStudentCurriculum } from "@/lib/curriculum/queries";
import { listHomework, bucketHomework } from "@/lib/curriculum/tree";
import { MarkedHomework } from "@/components/app/marked-homework";
import { TermBars } from "@/components/app/term-bars";
import { CountUp } from "@/components/app/count-up";

export const dynamic = "force-dynamic";

const pct = (n: number | null) => (n === null ? null : `${n.toFixed(1)}%`);

/**
 * Progress — the report card. The at-a-glance stuff (tiles, hifz pace,
 * strikes, leaderboards) lives on Home; this screen holds what Home doesn't:
 * the term-by-term breakdown and every mark, in one place.
 */
export default async function Progress() {
  const profile = (await currentProfile())!;
  const now = new Date();

  const [{ terms: calTerms }, full, curriculum] = await Promise.all([
    getTermsAndWeeks(),
    getFullProgress(profile.id),
    getStudentCurriculum(profile.id, now),
  ]);

  const termId = currentTermId(calTerms, now);
  // Each row carries its own score, so re-ordering is a pure client-side view
  // over data the page already has.
  const marked = bucketHomework(listHomework(curriculum.terms)).marked.map((entry) => ({
    entry,
    pct: curriculum.pctByHomeworkId.get(entry.homework.id) ?? null,
  }));

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl">Progress</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every mark for the year, term by term.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Term by term
        </h2>
        <div className="glass anim-in rounded-2xl p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                End of year
              </div>
              <div className="font-heading text-3xl">
                <CountUp value={full.eoyPct} decimals={1} suffix="%" />
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">mean of the three terms</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-chart-1" /> exam (80%)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-chart-3" /> homework (20%)
              </span>
            </div>
          </div>

          <div className="mt-6">
            <TermBars terms={full.terms} currentTermId={termId} />
          </div>
        </div>

        {/* The exact figures stay one tap away — the chart shows the shape of
            the year, the table answers "what precisely did I get". */}
        <details className="glass rounded-2xl px-4 py-3">
          <summary className="cursor-pointer text-xs text-ink-2 underline underline-offset-4">
            Show the exact marks
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted-foreground">
                  <th className="px-2 py-2.5 font-normal">Term</th>
                  <th className="px-2 py-2.5 text-right font-normal">Homework</th>
                  <th className="px-2 py-2.5 text-right font-normal">Exam</th>
                  <th className="px-2 py-2.5 text-right font-normal">Term %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {full.terms.map((t) => (
                  <tr key={t.termId} className={t.termId === termId ? "bg-foreground/4" : undefined}>
                    <td className="px-2 py-2.5">
                      Term {t.termId}
                      {t.termId === termId && (
                        <span className="ml-2 text-xs text-muted-foreground">current</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      {pct(t.hwAvg) ?? <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      {t.examScore === null ? (
                        <span className="text-muted-foreground/50">not sat</span>
                      ) : (
                        `${t.examScore}/${t.examMax}`
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-right font-medium tabular-nums">
                      {pct(t.termPct) ?? <span className="text-muted-foreground/50">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        <p className="text-xs text-muted-foreground">
          Term % is 80% exam and 20% homework. It only appears once the exam is entered.
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Marked homework <span className="tabular-nums">({marked.length})</span>
          </h2>
          <Link href="/courses" className="text-xs text-ink-2 underline underline-offset-4">
            See it in context →
          </Link>
        </div>
        {marked.length === 0 ? (
          <p className="glass rounded-2xl p-4 text-sm text-muted-foreground">
            Nothing marked yet.
          </p>
        ) : (
          <MarkedHomework rows={marked} />
        )}
      </section>
    </div>
  );
}
