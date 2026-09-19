// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { DepositRoster } from "./deposit-roster";
import { DEPOSIT_COLS } from "@/lib/deposits/columns";
import type { DepositRow } from "@/lib/deposits/queries";

// The server actions are the only thing in here that reaches out of the
// browser; everything else under test is local state.
const actions = vi.hoisted(() => ({
  addEntry: vi.fn(async () => ({ ok: true as const })),
  addPayment: vi.fn(async () => ({ ok: true as const })),
  deleteEntry: vi.fn(async () => ({ ok: true as const })),
  removeLastPayment: vi.fn(async () => ({ ok: true as const })),
  setEntryNotes: vi.fn(async () => ({ ok: true as const })),
  setSeasonFigures: vi.fn(async () => ({ ok: true as const })),
  setStillIn: vi.fn(async () => ({ ok: true as const })),
  setStrikeCount: vi.fn(async () => ({ ok: true as const })),
}));
vi.mock("@/lib/deposits/actions", () => actions);

const rows: DepositRow[] = [
  {
    id: "e1", student_id: "s1", full_name: "Aisha", section: "brothers",
    still_in: true, strikes: [0, 1, 2], notes: "paid late",
    total: 40, first_amount: 20, re_entries: 1,
  },
];

afterEach(() => {
  cleanup();
  Object.values(actions).forEach((fn) => fn.mockClear());
});

function roster() {
  return render(<DepositRoster seasonId={1} rows={rows} price={20} />);
}

describe("DepositRoster", () => {
  it("heads every column the ledger declares", () => {
    roster();
    const heads = screen.getAllByRole("columnheader");
    expect(heads).toHaveLength(DEPOSIT_COLS.length);
    heads.forEach((th, i) => expect(th.textContent).toBe(DEPOSIT_COLS[i].label));
  });

  it("labels every cell, so the phone's card layout can name it", () => {
    const { container } = roster();
    const body = container.querySelector("tbody")!;
    const cells = within(body).getAllByRole("cell");
    expect(cells).toHaveLength(DEPOSIT_COLS.length);
    cells.forEach((td, i) => {
      expect(td.getAttribute("data-label")).toBe(DEPOSIT_COLS[i].label);
      expect(td.getAttribute("data-col")).toBe(DEPOSIT_COLS[i].key);
    });
  });

  it("flips Y to N before the server answers", () => {
    roster();
    const yn = screen.getByRole("button", { name: "Mark Aisha as no longer on the course" });
    expect(yn.textContent).toBe("Y");
    fireEvent.click(yn);
    expect(screen.getByRole("button", { name: /Mark Aisha as on the course/ }).textContent).toBe("N");
    expect(actions.setStillIn).toHaveBeenCalledWith("e1", false);
  });

  it("takes two clicks to remove a row", () => {
    roster();
    fireEvent.click(screen.getByRole("button", { name: "Remove Aisha from the roster" }));
    expect(actions.deleteEntry).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm removing Aisha" }));
    expect(actions.deleteEntry).toHaveBeenCalledWith("e1");
  });
});
