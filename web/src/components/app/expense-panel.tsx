"use client";

import { useState, useTransition } from "react";
import { Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addExpense, deleteExpense, setExpenseReimbursed } from "@/lib/deposits/actions";
import type { ExpenseRow } from "@/lib/deposits/queries";
import { EXPENSE_COLS, type ExpenseColKey } from "@/lib/deposits/columns";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  "gifts", "prizes", "speakers", "catering", "supplies", "decor", "travel", "other",
] as const;

/** Key and label on every cell: below `md` the table folds into cards and the
 *  label is the only thing left naming the value. */
function cell(key: ExpenseColKey, extra?: string) {
  const col = EXPENSE_COLS.find((c) => c.key === key)!;
  return { "data-col": key, "data-label": col.label, className: cn(col.align, extra) };
}

function CostRow({ x }: { x: ExpenseRow }) {
  const [pending, startTransition] = useTransition();
  const [reimbursed, setReimbursed] = useState(x.reimbursed);
  const [confirming, setConfirming] = useState(false);
  const run = (fn: () => Promise<unknown>) => startTransition(() => void fn());

  return (
    <tr role="row" className={pending ? "opacity-60" : undefined}>
      <td role="cell" {...cell("what", "font-medium")}>{x.description}</td>
      <td role="cell" {...cell("category", "capitalize text-muted-foreground")}>{x.category}</td>
      <td role="cell" {...cell("payer")}>{x.payer}</td>
      <td role="cell" {...cell("repaid")}>
        {/* Empty until ticked; the box brightens under the cursor and only
            shows the mark once it is actually on. */}
        <button
          type="button"
          className="tickbox"
          aria-pressed={reimbursed}
          disabled={pending}
          aria-label={reimbursed ? `Mark ${x.description} as not reimbursed` : `Mark ${x.description} as reimbursed`}
          title={reimbursed ? "Reimbursed" : "Not reimbursed yet"}
          onClick={() => {
            const next = !reimbursed;
            setReimbursed(next);
            run(() => setExpenseReimbursed(x.id, next));
          }}
        >
          <Check className="size-3" strokeWidth={3} />
        </button>
      </td>
      <td role="cell" {...cell("amount", "font-semibold")}>£{x.amount.toFixed(2)}</td>
      <td role="cell" {...cell("remove")}>
        {confirming ? (
          <span className="flex items-center justify-center gap-0.5">
            <button
              type="button" className="iconbtn danger" disabled={pending}
              aria-label={`Confirm deleting ${x.description}`} title="Confirm"
              onClick={() => run(() => deleteExpense(x.id))}
            >
              <Check className="size-3.5" />
            </button>
            <button
              type="button" className="iconbtn" onClick={() => setConfirming(false)}
              aria-label="Cancel" title="Cancel"
            >
              <span className="text-xs leading-none">×</span>
            </button>
          </span>
        ) : (
          <button
            type="button" className="iconbtn danger" disabled={pending}
            aria-label={`Delete ${x.description}`} title="Delete this cost"
            onClick={() => setConfirming(true)}
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </td>
    </tr>
  );
}

/** Sentinel for the free-text branch. Not a uuid, so it can never collide
 *  with a real teacher id. */
const OTHER = "__other";

export function ExpensePanel({
  seasonId, expenses, teachers,
}: {
  seasonId: number;
  expenses: ExpenseRow[];
  teachers: { id: string; full_name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("other");
  const [amount, setAmount] = useState("");
  const [payerId, setPayerId] = useState("");
  const [otherName, setOtherName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isOther = payerId === OTHER;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addExpense(
        seasonId, description, category, Number(amount),
        isOther || !payerId ? null : payerId,
        isOther ? otherName : "",
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDescription("");
      setAmount("");
      setPayerId("");
      setOtherName("");
    });
  }

  const total = expenses.reduce((sum, x) => sum + x.amount, 0);

  return (
    <>
      <div className="twrap">
        {/* The roles are spelled out because the phone layout changes
            `display`, and Chrome drops a table's implicit semantics the
            moment it does. */}
        <table className="ledger" role="table">
          <thead role="rowgroup">
            <tr role="row">
              {EXPENSE_COLS.map((col) => (
                <th key={col.key} role="columnheader" className={cn(col.align)}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody role="rowgroup">
            {expenses.map((x) => <CostRow key={x.id} x={x} />)}
            {expenses.length === 0 && (
              <tr role="row">
                <td role="cell" colSpan={6} className="py-6 text-muted-foreground">
                  Nothing spent yet this year.
                </td>
              </tr>
            )}
          </tbody>
          {expenses.length > 0 && (
            <tfoot role="rowgroup">
              <tr role="row">
                <td
                  role="cell" colSpan={4} data-col="count"
                  className="text-xs uppercase tracking-wider text-muted-foreground"
                >
                  {expenses.length} {expenses.length === 1 ? "line" : "lines"}
                </td>
                <td role="cell" data-col="total" data-label="Total" className="r font-heading text-base">
                  £{total.toFixed(2)}
                </td>
                <td role="cell" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* One field per line on a phone, the desktop row above it. */}
      <form
        onSubmit={submit}
        className="mt-6 grid gap-2 border-t border-line pt-5 md:flex md:flex-wrap md:items-end"
      >
        <Input
          value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="What it went on" aria-label="Description"
          className="h-8 w-full md:min-w-[12rem] md:flex-1"
        />
        <select
          value={category} onChange={(e) => setCategory(e.target.value)}
          aria-label="Category"
          className="h-8 w-full rounded-lg border border-line bg-background text-foreground px-2 text-sm capitalize md:w-auto"
        >
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={payerId} onChange={(e) => setPayerId(e.target.value)}
          aria-label="Paid by"
          className="h-8 w-full rounded-lg border border-line bg-background text-foreground px-2 text-sm md:w-auto"
        >
          <option value="">Paid by…</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>{t.full_name}</option>
          ))}
          <option value={OTHER}>Other…</option>
        </select>
        {isOther && (
          <Input
            value={otherName} onChange={(e) => setOtherName(e.target.value)}
            placeholder="Their name" aria-label="Name of whoever paid"
            autoFocus className="h-8 w-full md:w-32"
          />
        )}
        <Input
          value={amount} onChange={(e) => setAmount(e.target.value)}
          type="number" min="0" step="0.01" placeholder="0.00" aria-label="Amount"
          className="h-8 w-full text-right tabular-nums md:w-24"
        />
        <Button type="submit" size="sm" disabled={pending}>Add cost</Button>
        {error && <p className="w-full text-sm text-danger">{error}</p>}
      </form>
    </>
  );
}
