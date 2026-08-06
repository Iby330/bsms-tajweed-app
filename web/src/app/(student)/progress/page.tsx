import Link from "next/link";
import { currentProfile } from "@/lib/supabase/server";
import { getTermsAndWeeks, currentTermId, getFullProgress } from "@/lib/dashboard/queries";
import { getStudentCurriculum } from "@/lib/curriculum/queries";
import { listHomework, bucketHomework } from "@/lib/curriculum/tree";
import { HomeworkRow } from "@/components/app/homework-row";

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
  const marked = bucketHomework(listHomework(curriculum.terms)).marked;
  const markedTerms = [...new Set(marked.map((e) => e.termId))].sort((a, b) => b - a);

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
        <div className="overflow-hidden rounded-lg border border-line bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-normal">Term</th>
                <th className="px-4 py-2.5 text-right font-normal">Homework</th>
                <th className="px-4 py-2.5 text-right font-normal">Exam</th>
                <th className="px-4 py-2.5 text-right font-normal">Term %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {full.terms.map((t) => (
                <tr key={t.termId} className={t.termId === termId ? "bg-muted/40" : undefined}>
                  <td className="px-4 py-2.5">
                    Term {t.termId}
                    {t.termId === termId && (
                      <span className="ml-2 text-xs text-muted-foreground">current</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {pct(t.hwAvg) ?? <span className="text-muted-foreground/50">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {t.examScore === null ? (
                      <span className="text-muted-foreground/50">not sat</span>
                    ) : (
                      `${t.examScore}/${t.examMax}`
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                    {pct(t.termPct) ?? <span className="text-muted-foreground/50">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line">
                <td className="px-4 py-2.5 text-xs text-muted-foreground" colSpan={3}>
                  End of year — mean of the three terms
                </td>
                <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                  {pct(full.eoyPct) ?? <span className="text-muted-foreground/50">—</span>}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
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
          <p className="rounded-lg border border-line bg-card p-4 text-sm text-muted-foreground">
            Nothing marked yet.
          </p>
        ) : (
          <div className="space-y-4">
            {markedTerms.map((tid) => {
              const rows = marked.filter((e) => e.termId === tid);
              return (
                <div key={tid} className="space-y-1.5">
                  <h3 className="text-xs text-muted-foreground">
                    Term {tid}{" "}
                    <span className="tabular-nums text-muted-foreground/60">· {rows.length}</span>
                  </h3>
                  <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-card">
                    {rows.map((e) => (
                      <HomeworkRow
                        key={e.homework.id}
                        entry={e}
                        pct={curriculum.pctByHomeworkId.get(e.homework.id)}
                      />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
