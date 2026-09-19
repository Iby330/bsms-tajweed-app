"use client";

import { useState, useTransition } from "react";
import { Check, Minus, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  addPayment, deleteEntry, removeLastPayment, setEntryNotes, setStillIn, setStrikeCount,
} from "@/lib/deposits/actions";
import type { DepositRow } from "@/lib/deposits/queries";
import { DEPOSIT_COLS, type DepositColKey } from "@/lib/deposits/columns";
import { AddPersonForm } from "@/components/app/season-figures";

/** Every cell carries its column's key and label: the header is what a mouse
 *  reads, the label is what the phone's card layout prints above the value. */
function cell(key: DepositColKey, extra?: string) {
  const col = DEPOSIT_COLS.find((c) => c.key === key)!;
  return { "data-col": key, "data-label": col.label, className: cn(col.align, extra) };
}

/**
 * The roster, as a table rather than a list of cards.
 *
 * The previous version repeated every column name against every row on narrow
 * screens, which is legible but reads as noise once there are seventy of them.
 * A real table puts the names once along the top and lets the eye run down a
 * column — which is the one thing a spreadsheet does well and the reason this
 * screen is replacing one. Under 768px the CSS folds the same rows back into
 * cards, where eleven columns cannot fit.
 */
function EntryRow({ row, price }: { row: DepositRow; price: number }) {
  const [pending, startTransition] = useTransition();
  const [stillIn, setIn] = useState(row.still_in);
  const [notes, setNotes] = useState(row.notes ?? "");
  const [strikes, setStrikes] = useState(row.strikes);
  const [confirming, setConfirming] = useState(false);

  const run = (fn: () => Promise<unknown>) => startTransition(() => void fn());

  return (
    <tr role="row" className={cn(!stillIn && "out", pending && "opacity-60")}>
      <td role="cell" {...cell("name", "nm")}>
        <span className="flex items-center gap-2">
          <span className="font-semibold">{row.full_name}</span>
          {!row.student_id && (
            <span
              title="No app account. Their strike counts are typed in by hand"
              className="shrink-0 rounded border border-line px-1 py-px text-[9px] uppercase tracking-wide text-muted-foreground"
            >
              no acct
            </span>
          )}
        </span>
      </td>

      <td role="cell" {...cell("in")}>
        <button
          type="button"
          className="yn"
          data-in={stillIn}
          disabled={pending}
          aria-label={stillIn ? `Mark ${row.full_name} as no longer on the course` : `Mark ${row.full_name} as on the course`}
          title={stillIn ? "On the course. Click to remove" : "Left the course. Click to restore"}
          onClick={() => {
            const next = !stillIn;
            setIn(next);
            run(() => setStillIn(row.id, next));
          }}
        >
          {stillIn ? "Y" : "N"}
        </button>
      </td>

      <td role="cell" {...cell("total", "font-semibold")}>£{row.total.toFixed(2)}</td>

      {/* What they actually paid, not the current price — those differ the
          moment the deposit is re-priced mid-year. */}
      <td role="cell" {...cell("first")}>
        {row.first_amount === null ? "–" : `£${row.first_amount.toFixed(2)}`}
      </td>

      <td role="cell" {...cell("reentry")}>
        {row.re_entries > 0 ? (
          <span className="tabular-nums">{row.re_entries}</span>
        ) : (
          <span className="text-muted-foreground">–</span>
        )}
      </td>

      <td role="cell" {...cell("pay")}>
        <span className="flex items-center justify-center gap-0.5">
          {/* The price is named here rather than left implicit: it is the one
              place the season's deposit figure actually bites, so it should be
              legible before you click, not after. */}
          <button
            type="button" className="iconbtn" disabled={pending}
            aria-label={`Record a £${price.toFixed(2)} payment for ${row.full_name}`}
            title={`Record a £${price.toFixed(2)} ${row.total > 0 ? "re-entry" : "deposit"}`}
            onClick={() => run(() => addPayment(row.id, price, row.total > 0 ? "re_entry" : "deposit"))}
          >
            <Plus className="size-3.5" />
          </button>
          <button
            type="button" className="iconbtn" disabled={pending || row.total === 0}
            aria-label={`Undo the last payment for ${row.full_name}`} title="Undo the last payment"
            onClick={() => run(() => removeLastPayment(row.id))}
          >
            <Minus className="size-3.5" />
          </button>
        </span>
      </td>

      {([1, 2, 3] as const).map((term) => (
        <td key={term} role="cell" {...cell(`t${term}`)}>
          <Input
            type="number" min={0} max={9}
            aria-label={`Term ${term} strikes for ${row.full_name}`}
            value={strikes[term - 1]}
            disabled={pending}
            onChange={(e) => {
              const next = [...strikes] as [number, number, number];
              next[term - 1] = Number(e.target.value);
              setStrikes(next);
            }}
            onBlur={() => run(() => setStrikeCount(row.id, term, strikes[term - 1]))}
            className={cn(
              "h-10 w-10 px-1 text-center tabular-nums md:h-6",
              strikes[term - 1] >= 3 && "border-danger/50 text-danger",
            )}
          />
        </td>
      ))}

      <td role="cell" {...cell("notes")}>
        <Input
          value={notes} disabled={pending} placeholder="–"
          aria-label={`Notes for ${row.full_name}`}
          // The column is narrow by necessity; hovering shows the whole note
          // without having to click into the field.
          title={notes || undefined}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => run(() => setEntryNotes(row.id, notes))}
          className="h-10 w-full border-transparent bg-transparent px-1 text-sm hover:border-line focus:border-line md:h-6 md:min-w-[7rem]"
        />
      </td>

      <td role="cell" {...cell("remove")}>
        {/* Two taps to delete. The Y/N above is how someone leaves the course;
            this is only for a row that should never have been here. */}
        {confirming ? (
          <span className="flex items-center gap-0.5">
            <button
              type="button" className="iconbtn danger" disabled={pending}
              aria-label={`Confirm removing ${row.full_name}`} title="Confirm"
              onClick={() => run(() => deleteEntry(row.id))}
            >
              <Check className="size-3.5" />
            </button>
            <button
              type="button" className="iconbtn" onClick={() => setConfirming(false)}
              aria-label="Cancel" title="Cancel"
            >
              <Minus className="size-3.5" />
            </button>
          </span>
        ) : (
          <button
            type="button" className="iconbtn danger" disabled={pending}
            aria-label={`Remove ${row.full_name} from the roster`}
            title="Remove this row entirely"
            onClick={() => setConfirming(true)}
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </td>
    </tr>
  );
}

/**
 * Brothers and sisters as their own tabs rather than one long page.
 *
 * At 28 rows either shape works; at the ~70 a real year carries, one table is
 * both a scrolling problem and a rendering one — the guidelines put the
 * virtualisation threshold at 50. Splitting by section halves what is on
 * screen, and it matches how the programme is actually run: nobody works
 * across both sides at once.
 */
export function DepositRoster({
  seasonId, rows, price,
}: { seasonId: number; rows: DepositRow[]; price: number }) {
  const sections: ("brothers" | "sisters")[] = ["brothers", "sisters"];
  const [side, setSide] = useState<"brothers" | "sisters">("brothers");

  return (
    <>
      <div className="mb-4 flex gap-1" role="tablist" aria-label="Section">
        {sections.map((section) => {
          const group = rows.filter((r) => r.section === section);
          const inCount = group.filter((r) => r.still_in).length;
          return (
            <button
              key={section}
              type="button"
              role="tab"
              aria-selected={side === section}
              onClick={() => setSide(section)}
              className={cn(
                "sidetab",
                side === section && "on",
              )}
            >
              <span className="capitalize">{section}</span>
              <span className="ml-2 tabular-nums opacity-60">
                {inCount}/{group.length}
              </span>
            </button>
          );
        })}
      </div>

      {sections.filter((s) => s === side).map((section) => {
        const group = rows.filter((r) => r.section === section);
        if (!group.length) {
          return (
            <p key={section} className="py-6 text-sm text-muted-foreground">
              Nobody on the {section} side yet.
            </p>
          );
        }
        const inCount = group.filter((r) => r.still_in).length;
        return (
          // One table, its own sticky header. The section tabs above already
          // name which side you are on, so the heading here would only repeat
          // them — the count is the part still worth saying.
          <section key={section}>
            <div className="mb-2 flex flex-wrap items-baseline justify-end gap-2">
              <span className="text-xs text-muted-foreground">
                {inCount} of {group.length} still in
              </span>
            </div>
            <div className="twrap">
              {/* The roles are spelled out because the phone layout changes
                  `display`, and Chrome drops a table's implicit semantics the
                  moment it does. */}
              <table className="ledger" role="table">
                <thead role="rowgroup">
                  <tr role="row">
                    {DEPOSIT_COLS.map((col) => (
                      <th key={col.key} role="columnheader" className={cn(col.align)}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {group.map((row) => (
                    <EntryRow key={row.id} row={row} price={price} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      <div className="mt-6">
        <AddPersonForm seasonId={seasonId} />
      </div>
    </>
  );
}
