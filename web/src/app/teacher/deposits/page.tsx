import type { Metadata } from "next";
import { cn } from "@/lib/utils";
import { DepositRoster } from "@/components/app/deposit-roster";
import { DepositTabs } from "@/components/app/deposit-tabs";
import { ExpensePanel } from "@/components/app/expense-panel";
import { SeasonFigures } from "@/components/app/season-figures";
import {
  currentSeason, depositRoster, financeAudit, seasonExpenses, seasonFinance,
  teacherOptions,
} from "@/lib/deposits/queries";

export const metadata: Metadata = { title: "Deposits" };
export const dynamic = "force-dynamic";

const money = (n: number) => `£${n.toFixed(2)}`;

/** One figure in the money panel, with a line of plain English under it. */
function Figure({ label, value, hint, tone, big }: {
  label: string; value: string; hint?: string;
  tone?: "ok" | "danger"; big?: boolean;
}) {
  return (
    <div>
      <span className="label">{label}</span>
      <div
        className={cn(
          "mt-1 font-heading tabular-nums",
          big ? "text-3xl" : "text-2xl",
          tone === "ok" && "text-ok",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * The deposit tracker.
 *
 * Split across tabs rather than stacked: the roster and the accounts answer
 * different questions and were never looked at together, so putting both on
 * one page only bought a lot of scrolling. Money opens first — it is the one
 * anybody checks.
 */
export default async function Deposits() {
  const season = await currentSeason();
  if (!season) {
    return (
      <header className="masthead">
        <h1><span>Deposits</span></h1>
        <p>No season has been set up yet.</p>
      </header>
    );
  }

  const [finance, roster, expenses, audit, teachers] = await Promise.all([
    seasonFinance(season.id),
    depositRoster(season.id),
    seasonExpenses(season.id),
    financeAudit(20),
    teacherOptions(),
  ]);

  const paidUp = roster.filter((r) => r.total > 0).length;
  const stillIn = roster.filter((r) => r.still_in).length;
  const owed = expenses.filter((x) => !x.reimbursed);
  const owedTotal = owed.reduce((sum, x) => sum + x.amount, 0);
  const left = finance?.left_over ?? 0;
  const price = Number(season.deposit_amount);

  const moneyPanel = (
    <div className="field">
      <section className="box c12">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <span className="label">Where the year stands</span>
            <p className="mt-2 max-w-[65ch] text-sm text-muted-foreground">
              Only the two figures on the right are typed in. Everything else is
              added up from the roster and the costs.
            </p>
          </div>
          <SeasonFigures
            seasonId={season.id}
            openingBalance={Number(season.opening_balance)}
            depositAmount={price}
          />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-5 border-t border-line pt-5 sm:grid-cols-4">
          <Figure
            label="Carried over" value={money(Number(finance?.opening_balance ?? 0))}
            hint="left from last year"
          />
          <Figure
            label="Deposits" value={money(Number(finance?.deposits ?? 0))}
            hint={`${paidUp} of ${roster.length} have paid`}
          />
          <Figure
            label="Gross income" value={money(Number(finance?.gross_income ?? 0))}
            hint="carried over + deposits"
          />
          <Figure
            label="Spent" value={money(Number(finance?.costs ?? 0))}
            hint={`across ${expenses.length} ${expenses.length === 1 ? "cost" : "costs"}`}
          />
        </div>
      </section>

      <section className="box c12">
        <div className="flex flex-wrap items-end justify-between gap-5">
          {/* Same figure as the chip in the masthead, and named the same way
              on purpose — one number under two labels on one screen is how
              people stop trusting either. What it becomes at year end is said
              underneath rather than in the heading. */}
          <Figure
            label="Current budget" value={money(left)} big
            tone={left < 0 ? "danger" : "ok"}
            hint={
              left < 0
                ? "spending is ahead of income"
                : "left to spend — and what carries into next year"
            }
          />
          {owed.length > 0 && (
            <Figure
              label="Still to repay" value={money(owedTotal)}
              hint={`owed back to ${owed.length === 1 ? "one person" : `${owed.length} people`}`}
            />
          )}
        </div>
      </section>
    </div>
  );

  const rosterPanel = (
    <div className="field">
      <section className="box c12">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <span className="label">Everyone, from the first lesson on</span>
          <span className="text-xs text-muted-foreground">
            {stillIn} still in · {roster.length - stillIn} left · {paidUp} paid
          </span>
        </div>
        <p className="mt-2 mb-5 max-w-[65ch] text-sm text-muted-foreground">
          Set someone to <strong>N</strong> and they stay listed but grey — they
          left the course. The bin removes the row altogether.
        </p>
        <DepositRoster seasonId={season.id} rows={roster} price={price} />
      </section>
    </div>
  );

  const costsPanel = (
    <div className="field">
      <section className="box c12">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <span className="label">What the money went on</span>
          <span className="text-xs text-muted-foreground">
            {owed.length} still to repay
          </span>
        </div>
        <p className="mt-2 mb-5 max-w-[65ch] text-sm text-muted-foreground">
          Tick <strong>Repaid</strong> once whoever fronted the money has had it back.
        </p>
        <ExpensePanel seasonId={season.id} expenses={expenses} teachers={teachers} />
      </section>
    </div>
  );

  const historyPanel = (
    <div className="field">
      <section className="box c12">
        <span className="label">Every change to the money</span>
        <p className="mt-2 mb-5 max-w-[65ch] text-sm text-muted-foreground">
          Any teacher can edit any of this, so all of it is recorded.
        </p>
        <ul className="timeline">
          {audit.map((a) => (
            <li key={a.id}>
              <span className="min-w-0">
                <span className="who">{a.actor}</span>{" "}
                <span className="did">
                  {a.action === "insert" ? "added" : a.action === "delete" ? "removed" : "changed"}
                </span>{" "}
                <span className="what">{a.summary}</span>
              </span>
              <time dateTime={a.at}>
                {new Date(a.at).toLocaleString("en-GB", {
                  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                })}
              </time>
            </li>
          ))}
          {audit.length === 0 && (
            <li><span className="did">Nothing has changed yet.</span></li>
          )}
        </ul>
      </section>
    </div>
  );

  return (
    <>
      <header className="masthead">
        <h1><span>Deposits</span></h1>
        <p>Every deposit taken and every pound spent, for {season.label}.</p>
        <div className="meta">
          <span className="label">{season.label}</span>
          {/* Gross income minus everything spent — what there is to spend
              right now, which is the question anyone opening this page has. */}
          <span className="label hi">{money(left)} current budget</span>
        </div>
      </header>

      <DepositTabs
        money={moneyPanel}
        roster={rosterPanel}
        costs={costsPanel}
        history={historyPanel}
        rosterCount={roster.length}
        costCount={expenses.length}
      />
    </>
  );
}
