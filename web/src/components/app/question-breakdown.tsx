import Link from "next/link";
import { MixedText } from "@/components/app/mixed-text";
import { parseOptions, parseRubric } from "@/lib/marking/objective";
import { isTapWords } from "@/lib/homework/tap-words";
import { questionStats, tallyOptions, type ScoreAnswer } from "@/lib/marking/responses";
import { fmtMarks, pctTone, responseIsEmpty, textOf } from "@/lib/homework/logic";
import { cn } from "@/lib/utils";

const QTYPE: Record<string, string> = {
  mcq: "Multiple choice",
  checkbox: "Select all that apply",
  text: "Short written answer",
  paragraph: "Written answer",
  grid: "Grid",
};

const SCORING: Record<string, string> = {
  exact: "all-or-nothing",
  per_option: "one mark per correct option, wrong picks cancel",
  manual: "marked by hand",
};

export type BreakdownQuestion = {
  id: string;
  qtype: string;
  scoring: string;
  prompt: string;
  points: number;
  is_bonus: boolean;
  is_task: boolean;
  needs_key: boolean;
  options: unknown;
  rubric: unknown;
};

/** Who wrote an answer, and where their whole script is. */
export type Attribution = { name: string; href: string };

/**
 * Every question with what the class did to it.
 *
 * One component for two states on purpose. Given answers it is the Question
 * tab — the tally under each option, every written answer with the mark it
 * earned. Given none it is the paper itself: the answer key, the mark scheme
 * and how each question scores, which is exactly what a teacher needs from a
 * week nobody has handed in yet. The key stays visible in both, because a
 * teacher reading answers is checking them against it.
 */
export function QuestionBreakdown({
  questions,
  answers,
  attribution,
}: {
  questions: BreakdownQuestion[];
  /** Empty renders the paper alone. */
  answers: ScoreAnswer[];
  /** submission id → the student who handed it in. */
  attribution: (submissionId: string) => Attribution | null;
}) {
  const stats = new Map(
    questionStats(questions, answers).map((s) => [s.questionId, s]),
  );
  const byQuestion = new Map<string, ScoreAnswer[]>();
  for (const a of answers) {
    const list = byQuestion.get(a.question_id) ?? [];
    list.push(a);
    byQuestion.set(a.question_id, list);
  }

  return (
    <div className="space-y-3">
      {questions.map((q, i) => {
        const options = parseOptions(q.options);
        const rubric = parseRubric(q.rubric);
        const points = Number(q.points);
        const stat = stats.get(q.id);
        const rows = byQuestion.get(q.id) ?? [];
        const gap =
          points > 0 && !q.is_task && !options?.some((o) => o.correct) && !rubric?.length;

        // Written answers, attributed and in register order. A row whose
        // student is not on this teacher's roster cannot appear — the caller
        // only ever hands over their own class's submissions.
        const written = rows
          .map((a) => ({ answer: a, who: attribution(a.submission_id) }))
          .filter((r): r is { answer: ScoreAnswer; who: Attribution } => r.who !== null)
          .sort((a, b) => a.who.name.localeCompare(b.who.name));

        return (
          <section key={q.id} className="box c12">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <span>Q{i + 1}</span>
                  <span className="normal-case">{QTYPE[q.qtype] ?? q.qtype}</span>
                  {q.is_bonus && (
                    <span className="rounded bg-muted px-1.5 py-0.5 normal-case">
                      bonus · excluded from total
                    </span>
                  )}
                  {q.is_task && (
                    <span className="rounded bg-muted px-1.5 py-0.5 normal-case">
                      practical task
                    </span>
                  )}
                  {q.needs_key && (
                    <span className="rounded bg-warn/12 px-1.5 py-0.5 text-warn normal-case">
                      no answer key
                    </span>
                  )}
                </div>
                <MixedText
                  text={q.prompt}
                  variant="quran"
                  className="mt-2 block text-[15px] leading-relaxed"
                />
              </div>
              <div className="shrink-0 text-right">
                <div className="font-heading text-lg tabular-nums">{fmtMarks(points)}</div>
                <div className="text-[11px] text-muted-foreground">
                  {points === 1 ? "mark" : "marks"}
                </div>
              </div>
            </div>

            {/* How the class did on this one question — the line that turns a
                paper into results. Only ever shown for questions someone has
                actually been marked on. */}
            {stat && stat.marked > 0 && points > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={cn(
                    "rounded-md px-2 py-0.5 font-medium tabular-nums",
                    pctTone(stat.pctOfMax) === "ok" && "bg-ok/12 text-ok",
                    pctTone(stat.pctOfMax) === "warn" && "bg-warn/12 text-warn",
                    pctTone(stat.pctOfMax) === "danger" && "bg-danger/12 text-danger",
                  )}
                >
                  {Math.round(stat.pctOfMax)}% average
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {fmtMarks(Math.round(stat.mean * 100) / 100)} of {fmtMarks(points)} ·{" "}
                  {stat.marked} marked
                  {stat.blank > 0 && ` · ${stat.blank} left blank`}
                </span>
              </div>
            )}

            {/* A tap-the-rule passage is thirty words, and a tally row per word
                says nothing a teacher can act on — the useful figure is how
                many found each spot, which the per-question average above
                already carries. The passage itself belongs on the script. */}
            {options && isTapWords(options) ? (
              <p className="mt-4 text-xs text-muted-foreground">
                A passage of {options.length} words with{" "}
                {options.filter((o) => o.correct).length} to find. Open a student
                under Individual to see the passage with their taps on it.
              </p>
            ) : options && (
              <ul className="mt-4 space-y-1">
                {(() => {
                  const { tallies, blank } = tallyOptions(options, rows);
                  const most = Math.max(1, ...tallies.map((t) => t.count));
                  return (
                    <>
                      {tallies.map((t) => (
                        <li
                          key={t.position}
                          className="relative overflow-hidden rounded-md px-2.5 py-1.5 text-sm"
                        >
                          {/* The bar sits behind the option, so the text stays
                              on the same baseline whether or not anyone picked
                              it — a bar in its own column would shift them. */}
                          {rows.length > 0 && (
                            <span
                              aria-hidden
                              className={cn(
                                "absolute inset-y-0 left-0 rounded-md",
                                t.correct ? "bg-ok/15" : "bg-foreground/[0.06]",
                              )}
                              style={{ width: `${(t.count / most) * 100}%` }}
                            />
                          )}
                          {rows.length === 0 && t.correct && (
                            <span aria-hidden className="absolute inset-0 rounded-md bg-ok/10" />
                          )}
                          <span className="relative flex items-start gap-2.5">
                            <span
                              className={cn(
                                "w-6 shrink-0 text-xs",
                                t.correct ? "text-ok" : "text-muted-foreground",
                              )}
                            >
                              {t.correct ? "✓" : ""}
                            </span>
                            <MixedText text={t.value} className="min-w-0 flex-1" />
                            {rows.length > 0 && (
                              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                {t.count}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                      {blank > 0 && (
                        <li className="px-2.5 text-xs text-muted-foreground">
                          {blank} chose nothing
                        </li>
                      )}
                    </>
                  );
                })()}
              </ul>
            )}

            {rubric && (
              <div className="mt-4">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Mark scheme — the AI awards each point independently
                </div>
                <ul className="mt-2 space-y-1">
                  {rubric.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-start justify-between gap-3 rounded-md bg-muted px-2.5 py-1.5 text-sm"
                    >
                      <MixedText text={c.desc} className="min-w-0" />
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {fmtMarks(c.marks)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Written answers, one per student. Recitations are not here:
                a voice note is played on the student's own script, and a
                column of twenty players would load twenty audio files. */}
            {!options && written.length > 0 && (
              <div className="mt-4">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {q.is_task ? "Recitations" : `${written.length} answers`}
                </div>
                <ul className="mt-2 divide-y divide-line border-t border-line">
                  {written.map(({ answer: a, who }) => {
                    const mark = a.final_marks ?? a.auto_marks;
                    const text = textOf(a.response);
                    return (
                      <li key={a.submission_id} className="flex gap-3 py-2">
                        <Link
                          href={who.href}
                          className="w-32 shrink-0 truncate text-xs text-muted-foreground transition-colors hover:text-foreground hover:underline underline-offset-4"
                        >
                          {who.name}
                        </Link>
                        <div className="min-w-0 flex-1">
                          {q.is_task ? (
                            <span className="text-sm text-muted-foreground">
                              Recorded in the app — open their script to listen.
                            </span>
                          ) : responseIsEmpty(a.response) ? (
                            <span className="text-sm italic text-muted-foreground">
                              No answer given.
                            </span>
                          ) : (
                            <MixedText text={text} className="block text-sm leading-relaxed" />
                          )}
                        </div>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {mark === null ? "—" : `${fmtMarks(Number(mark))}/${fmtMarks(points)}`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {gap && (
              <p className="mt-4 rounded-md bg-warn/10 px-3 py-2 text-xs text-warn">
                No answer key or mark scheme for this question — a teacher enters the mark
                during review. Adding one here would let it mark automatically.
              </p>
            )}

            <p className="mt-3 text-[11px] text-muted-foreground">
              Scoring: {SCORING[q.scoring] ?? q.scoring}
            </p>
          </section>
        );
      })}
    </div>
  );
}
