import Link from "next/link";
import { currentProfile } from "@/lib/supabase/server";
import { currentTermId, getFullProgress } from "@/lib/dashboard/queries";
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

  // The curriculum read already carries the calendar it was built from, so
  // asking for terms separately would be a round trip for rows in hand.
  const [full, curriculum] = await Promise.all([
    getFullProgress(profile.id),
    getStudentCurriculum(profile.id, now),
  ]);

  const termId = currentTermId(curriculum.rows.terms, now);
  // Each row carries its own score, so re-ordering is a pure client-side view
  // over data the page already has.
  const marked = bucketHomework(listHomework(curriculum.terms)).marked.map((entry) => ({
    entry,
    pct: curriculum.pctByHomeworkId.get(entry.homework.id) ?? null,
  }));

  return (
    <>
      <header className="masthead">
        <h1><span>Progress</span></h1>
        <p>Every mark for the year, term by term.</p>
        <div className="meta">
          <span className="label">Term {termId}</span>
          <span className="label hi">{marked.length} marked so far</span>
        </div>
      </header>

      <div className="divider">
        <span className="label">Term by term</span>
        <span className="r" />
        <span className="m" />
      </div>

      <div className="field">
        <section className="box c12">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <span className="label">End of year</span>
              <div className="stat" style={{ marginTop: 8 }}>
                <span className="v sm">
                  {full.eoyPct === null ? "\u2014" : <CountUp value={full.eoyPct} decimals={1} />}
                </span>
                {full.eoyPct !== null && <span className="u">%</span>}
              </div>
              <div className="note">mean of the three terms</div>
            </div>
            <div className="legend">
              <span><i style={{ background: "var(--viz-exam)" }} /> exam (80%)</span>
              <span><i style={{ background: "var(--viz-hw)" }} /> homework (20%)</span>
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <TermBars terms={full.terms} currentTermId={termId} />
          </div>
        </section>

        <section className="box c12">
          <span className="label">The exact marks</span>
          <div className="twrap">
            <table className="marks">
              <thead>
                <tr>
                  <th>Term</th>
                  <th className="r">Homework</th>
                  <th className="r">Exam</th>
                  <th className="r">Term %</th>
                </tr>
              </thead>
              <tbody>
                {full.terms.map((t) => (
                  <tr key={t.termId} className={t.termId === termId ? "now" : undefined}>
                    <td>
                      Term {t.termId}
                      {t.termId === termId && <span className="label"> · current</span>}
                    </td>
                    <td className={pct(t.hwAvg) ? "r" : "r dim"}>{pct(t.hwAvg) ?? "\u2014"}</td>
                    <td className={t.examScore === null ? "r dim" : "r"}>
                      {t.examScore === null ? "not sat" : `${t.examScore}/${t.examMax}`}
                    </td>
                    <td className={pct(t.termPct) ? "r" : "r dim"}>{pct(t.termPct) ?? "\u2014"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="note">
            Term % is 80% exam and 20% homework. It only appears once the exam is entered.
          </div>
        </section>
      </div>

      <div className="divider">
        <span className="label">Marked homework · {marked.length}</span>
        <span className="r" />
        <span className="m" />
      </div>

      <div className="field">
        <section className="box c12" style={{ gap: 0 }}>
          {marked.length === 0 ? (
            <div className="note">Nothing marked yet.</div>
          ) : (
            <MarkedHomework rows={marked} />
          )}
        </section>
      </div>

      <div className="signoff">
        <span className="lines">{profile.classes?.name ?? "BSMS"}</span>
        <span className="wm" role="img" aria-label="BSMS Tajweed" />
        <Link href="/courses" className="lines right underline underline-offset-4">
          See it in context →
        </Link>
      </div>
    </>
  );
}
