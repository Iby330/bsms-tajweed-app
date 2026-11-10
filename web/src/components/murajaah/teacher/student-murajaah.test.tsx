// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { MurajaahTeacher, type MurajaahTeacherData } from "./murajaah-teacher";
import { StudentMurajaah } from "./student-murajaah";
import { TargetsButton, TargetsPanel } from "./targets-panel";
import { MIN, timed } from "../session-fixtures";
import { DEFAULT_CLASS_TARGET } from "@/lib/murajaah/targets";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/murajaah/actions", () => ({ saveTargets: vi.fn(async () => {}) }));

afterEach(cleanup);

const ALI = { id: "11111111-1111-4111-8111-111111111111", name: "Abdallah Ghouse" };
const DANIYAL = { id: "44444444-4444-4444-8444-444444444444", name: "Daniyal Thakur" };
const SHAMOON = { id: "33333333-3333-4333-8333-333333333333", name: "Shamoon" };

const ali1 = timed(21 * MIN + 34_000, { at: "2026-09-23", reciterId: ALI.id, mistakes: 3 });
const ali2 = timed(16 * MIN + 20_000, { at: "2026-11-04", reciterId: ALI.id, mistakes: 3, listenerName: "Daniyal Thakur" });
const other = timed(10 * MIN, { at: "2026-11-05", reciterId: DANIYAL.id, kind: "hizb", ns: [59], label: "Hizb 59", hizbEq: 1 });

const DATA: MurajaahTeacherData = {
  classId: "c0000000-0000-4000-8000-000000000000",
  className: "Esteemed Ustadhs",
  students: [ALI, DANIYAL, SHAMOON],
  sessions: [ali1, ali2, other],
  saved: { target: DEFAULT_CLASS_TARGET, overrides: [] },
  now: Date.parse("2026-11-08T12:00:00.000Z"),
};

const show = (id: string) =>
  render(
    <MurajaahTeacher data={DATA}>
      <TargetsButton />
      <StudentMurajaah studentId={id} />
      <TargetsPanel />
    </MurajaahTeacher>,
  );

describe("StudentMurajaah", () => {
  it("heads the page with the student, back to the roster, and prev/next round the roster", () => {
    const { getByRole, container } = show(ALI.id);
    expect(getByRole("heading", { name: ALI.name })).toBeTruthy();
    expect(container.textContent).toContain("2 attempts, last on 4 Nov (Juz 30)");
    expect(getByRole("link", { name: "All students" }).getAttribute("href")).toBe("/teacher/hifdh/murajaah");
    expect(getByRole("link", { name: `Previous student: ${SHAMOON.name}` }).getAttribute("href")).toBe(`/teacher/hifdh/murajaah/${SHAMOON.id}`);
    expect(getByRole("link", { name: `Next student: ${DANIYAL.name}` }).getAttribute("href")).toBe(`/teacher/hifdh/murajaah/${DANIYAL.id}`);
    expect(container.textContent).toContain("1 of 3");
  });

  it("shows only this student's attempts in the facts, the chart and the history", () => {
    const { container } = show(ALI.id);
    const facts = container.querySelector("[data-facts]")!.textContent;
    expect(facts).toContain("Best per hizb8:10");
    expect(facts).toContain("Mistake limit met2of 2");
    expect(container.querySelectorAll("rect[data-bar]")).toHaveLength(2);
    expect(container.querySelectorAll("li[data-session]")).toHaveLength(2);
    expect(container.textContent).toContain("Listened to by Daniyal Thakur");
    expect(container.querySelector("[data-caption]")!.textContent).toContain("5:14 per juz faster");
  });

  it("previews an unsaved target in the chart but not in the history", () => {
    const { getByRole, getByLabelText, container } = show(ALI.id);
    fireEvent.click(getByRole("button", { name: /Targets/ }));
    fireEvent.change(getByLabelText("Per juz, most mistakes"), { target: { value: "2" } });
    expect(container.querySelector("[data-caption]")!.textContent).toContain("over the limit of 2");
    // History rows keep the limit snapshotted when each attempt started.
    const latest = container.querySelector("li[data-session]")!;
    expect(latest.textContent).toContain("3/ 5met");
  });

  it("has empty states for a student with no attempts", () => {
    const { container } = show(SHAMOON.id);
    expect(container.textContent).toContain("0 attempts");
    expect(container.textContent).toContain("No attempts yet. Each saved revision adds a bar here.");
    expect(container.textContent).toContain("No saved attempts yet. Shamoon's revision shows here once a classmate logs it.");
  });
});
