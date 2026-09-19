/**
 * The ledger's columns, named once.
 *
 * Below `md` the tables stop being tables and become stacked cards, and a card
 * has no header row to look up to: each cell has to carry its own label. Both
 * layouts read that label from here, so the header and the card can never drift
 * apart, and the CSS addresses cells by `data-col` rather than by position.
 */
export type LedgerCol<K extends string> = {
  key: K;
  /** Header text, and the label a cell wears on a phone. */
  label: string;
  /** Maps to the table's own `r` / `c` alignment classes. */
  align?: "r" | "c";
};

// Declared literal so the key union below is derived rather than retyped, then
// exported under a uniform type so `col.align` reads on every entry.
const DEPOSITS = [
  { key: "name", label: "Name" },
  { key: "in", label: "In", align: "c" },
  { key: "total", label: "Total", align: "r" },
  { key: "first", label: "First", align: "r" },
  { key: "reentry", label: "Re-ent", align: "c" },
  { key: "pay", label: "Pay", align: "c" },
  { key: "t1", label: "T1", align: "c" },
  { key: "t2", label: "T2", align: "c" },
  { key: "t3", label: "T3", align: "c" },
  { key: "notes", label: "Notes" },
  { key: "remove", label: "", align: "c" },
] as const;

const EXPENSES = [
  { key: "what", label: "What it went on" },
  { key: "category", label: "Category" },
  { key: "payer", label: "Paid by" },
  { key: "repaid", label: "Repaid", align: "c" },
  { key: "amount", label: "Amount", align: "r" },
  { key: "remove", label: "", align: "c" },
] as const;

export type DepositColKey = (typeof DEPOSITS)[number]["key"];
export type ExpenseColKey = (typeof EXPENSES)[number]["key"];

export const DEPOSIT_COLS: readonly LedgerCol<DepositColKey>[] = DEPOSITS;
export const EXPENSE_COLS: readonly LedgerCol<ExpenseColKey>[] = EXPENSES;
