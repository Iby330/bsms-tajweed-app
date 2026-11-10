// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { MurajaahTeacher, type MurajaahTeacherData } from "./murajaah-teacher";
import { RosterTable } from "./roster-table";
import { TargetsPanel } from "./targets-panel";
import { MIN, timed } from "../session-fixtures";
import { DEFAULT_CLASS_TARGET } from "@/lib/murajaah/targets";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("@/lib/murajaah/actions", () => ({ saveTargets: vi.fn(async () => {}) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const NOW = Date.parse("2026-11-08T12:00:00.000Z");
const ALI = { id: "11111111-1111-4111-8111-111111111111", name: "Abdallah Ghouse" };
const YUNUS = { id: "22222222-2222-4222-8222-222222222222", name: "Yunus Zafar" };
const SHAMOON = { id: "33333333-3333-4333-8333-333333333333", name: "Shamoon" };

function data(over: Partial<MurajaahTeacherData> = {}): MurajaahTeacherData {
  return {
    classId: "c0000000-0000-4000-8000-000000000000",
    className: "Esteemed Ustadhs",
    students: [ALI, SHAMOON, YUNUS],
    sessions: [
      timed(21 * MIN, { at: "2026-11-02", reciterId: ALI.id, mistakes: 3 }),
      timed(16 * MIN + 20_000, { at: "2026-11-04", reciterId: ALI.id, mistakes: 3 }),
      timed(26 * MIN + 58_000, { at: "2026-11-04", reciterId: SHAMOON.id, mistakes: 7, label: "Juz 29", ns: [29] }),
      timed(9 * MIN + 38_000, { at: "2026-10-20", reciterId: YUNUS.id, mistakes: 3, kind: "hizb", ns: [58], label: "Hizb 58", hizbEq: 1 }),
    ],
    saved: { target: DEFAULT_CLASS_TARGET, overrides: [{ studentId: SHAMOON.id, hizb: 5, juz: 8, surah10: null, note: "Joined late" }] },
    now: NOW,
    ...over,
  };
}

const show = (d = data()) =>
  render(
    <MurajaahTeacher data={d}>
      <RosterTable />
      <TargetsPanel />
    </MurajaahTeacher>,
  );

const tableRow = (c: HTMLElement, id: string) => c.querySelector<HTMLTableRowElement>(`[data-roster] tr[data-student="${id}"]`)!;

describe("RosterTable", () => {
  it("summarises the class and lists who needs attention", () => {
    const { container } = show();
    const summary = [...container.querySelector("[data-summary]")!.children].map((c) => c.textContent);
    expect(summary).toEqual(["3 students", "3 attempts in the last 7 days, by 2 of 3", "0 getting faster per hizb"]);
    const attention = container.querySelector("[data-attention]")!;
    expect(attention.textContent).toContain("Yunus nothing logged in 7 days");
    expect(attention.textContent).not.toContain("Abdallah");
  });

  it("shows each student's latest time in its band and mistakes against their own limit", () => {
    const { container } = show();
    const ali = tableRow(container, ALI.id);
    expect(ali.textContent).toContain("Juz 30");
    expect(ali.textContent).toContain("4 Nov, 4 days ago");
    expect(ali.querySelector("[data-band]")!.getAttribute("data-band")).toBe("ideal");
    expect(ali.textContent).toContain("16:20");
    expect(ali.textContent).toContain("3/ 5met");
    expect(ali.textContent).toContain("8:10"); // best per hizb

    // Shamoon's override (juz ≤ 8) keeps 7 mistakes within the limit.
    const sh = tableRow(container, SHAMOON.id);
    expect(sh.textContent).toContain("Custom limits");
    expect(sh.textContent).toContain("7/ 8met");
    expect(sh.querySelector("[data-band]")!.getAttribute("data-band")).toBe("good");
  });

  it("opens a student's page from their row, and links their name", () => {
    const { container } = show();
    const ali = tableRow(container, ALI.id);
    expect(within(ali).getByRole("link", { name: ALI.name }).getAttribute("href")).toBe(`/teacher/hifdh/murajaah/${ALI.id}`);
    fireEvent.click(ali.querySelector("td:nth-child(3)")!);
    expect(push).toHaveBeenCalledWith(`/teacher/hifdh/murajaah/${ALI.id}`);
  });

  it("sorts by a column header, and back", () => {
    const { container, getByRole } = show();
    const order = () => [...container.querySelectorAll("[data-roster] tbody tr")].map((r) => r.getAttribute("data-student"));
    expect(order()).toEqual([ALI.id, SHAMOON.id, YUNUS.id]);
    fireEvent.click(getByRole("button", { name: /Last 7 days/ }));
    expect(order()).toEqual([YUNUS.id, SHAMOON.id, ALI.id]);
    fireEvent.click(getByRole("button", { name: /Last 7 days/ }));
    expect(order()).toEqual([ALI.id, SHAMOON.id, YUNUS.id]);
  });

  it("gives phones stacked cards with the same figures", () => {
    const { container } = show();
    const cards = container.querySelectorAll("[data-roster-cards] li");
    expect(cards).toHaveLength(3);
    expect(cards[0].textContent).toContain("Abdallah Ghouse");
    expect(cards[0].querySelector("a")!.getAttribute("href")).toBe(`/teacher/hifdh/murajaah/${ALI.id}`);
  });

  it("previews an unsaved target in the roster and the footnote", () => {
    const { container, getByRole, getByLabelText } = show();
    fireEvent.click(getByRole("button", { name: "Edit targets" }));
    fireEvent.change(getByLabelText("Per juz, most mistakes"), { target: { value: "2" } });
    expect(tableRow(container, ALI.id).textContent).toContain("3/ 2over");
    expect(container.querySelector("[data-footnote]")!.textContent).toContain("≤ 2 per juz");
    fireEvent.change(getByLabelText("Ideal up to, minutes per hizb"), { target: { value: "7.5" } });
    expect(tableRow(container, ALI.id).querySelector("[data-band]")!.getAttribute("data-band")).toBe("good");
  });

  it("explains the empty state before any session exists", () => {
    const { container } = show(data({ sessions: [] }));
    expect(container.querySelector("[data-empty]")!.textContent).toContain("Sessions appear here once the class start logging");
    expect(container.querySelector("[data-roster]")).toBeNull();
    expect(container.querySelector("[data-footnote]")).not.toBeNull();
  });
});
