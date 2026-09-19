// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { ExpensePanel } from "./expense-panel";
import { EXPENSE_COLS } from "@/lib/deposits/columns";
import type { ExpenseRow } from "@/lib/deposits/queries";

const actions = vi.hoisted(() => ({
  addExpense: vi.fn(async () => ({ ok: true as const })),
  deleteExpense: vi.fn(async () => ({ ok: true as const })),
  setExpenseReimbursed: vi.fn(async () => ({ ok: true as const })),
}));
vi.mock("@/lib/deposits/actions", () => actions);

const expenses: ExpenseRow[] = [
  {
    id: "x1", description: "Prize books", category: "prizes", amount: 55.5,
    paid_by: "t1", paid_by_name: null, payer: "Umar", reimbursed: false,
    incurred_on: "2026-01-04",
  },
];

afterEach(() => {
  cleanup();
  Object.values(actions).forEach((fn) => fn.mockClear());
});

function panel() {
  return render(<ExpensePanel seasonId={1} expenses={expenses} teachers={[{ id: "t1", full_name: "Umar" }]} />);
}

describe("ExpensePanel", () => {
  it("heads every column the ledger declares", () => {
    panel();
    const heads = screen.getAllByRole("columnheader");
    expect(heads).toHaveLength(EXPENSE_COLS.length);
    heads.forEach((th, i) => expect(th.textContent).toBe(EXPENSE_COLS[i].label));
  });

  it("labels every cell, so the phone's card layout can name it", () => {
    const { container } = panel();
    const body = container.querySelector("tbody")!;
    const cells = within(body).getAllByRole("cell");
    expect(cells).toHaveLength(EXPENSE_COLS.length);
    cells.forEach((td, i) => {
      expect(td.getAttribute("data-label")).toBe(EXPENSE_COLS[i].label);
      expect(td.getAttribute("data-col")).toBe(EXPENSE_COLS[i].key);
    });
  });

  it("ticks repaid before the server answers", () => {
    panel();
    const tick = screen.getByRole("button", { name: "Mark Prize books as reimbursed" });
    expect(tick.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(tick);
    const ticked = screen.getByRole("button", { name: "Mark Prize books as not reimbursed" });
    expect(ticked.getAttribute("aria-pressed")).toBe("true");
    expect(actions.setExpenseReimbursed).toHaveBeenCalledWith("x1", true);
  });

  it("takes two clicks to delete a cost", () => {
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Delete Prize books" }));
    expect(actions.deleteExpense).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm deleting Prize books" }));
    expect(actions.deleteExpense).toHaveBeenCalledWith("x1");
  });
});
