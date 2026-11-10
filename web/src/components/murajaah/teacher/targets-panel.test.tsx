// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import { MurajaahTeacher, type MurajaahTeacherData } from "./murajaah-teacher";
import { TargetsButton, TargetsPanel } from "./targets-panel";
import { DEFAULT_CLASS_TARGET } from "@/lib/murajaah/targets";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));
const saveTargets = vi.hoisted(() => vi.fn(async (..._a: unknown[]) => {}));
vi.mock("@/lib/murajaah/actions", () => ({ saveTargets }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const CLASS = "c0000000-0000-4000-8000-000000000000";
const ALI = { id: "11111111-1111-4111-8111-111111111111", name: "Abdallah Ghouse" };
const SHAMOON = { id: "33333333-3333-4333-8333-333333333333", name: "Shamoon" };

const DATA: MurajaahTeacherData = {
  classId: CLASS,
  className: "Esteemed Ustadhs",
  students: [ALI, SHAMOON],
  sessions: [],
  saved: { target: DEFAULT_CLASS_TARGET, overrides: [{ studentId: SHAMOON.id, hizb: 5, juz: 8, surah10: null, note: "Joined late" }] },
  now: Date.parse("2026-11-08T12:00:00.000Z"),
};

function open() {
  const r = render(
    <MurajaahTeacher data={DATA}>
      <TargetsButton />
      <TargetsPanel />
    </MurajaahTeacher>,
  );
  fireEvent.click(r.getByRole("button", { name: /Targets/ }));
  return r;
}

const status = (c: HTMLElement) => c.querySelector("[data-status]")!.textContent;

describe("TargetsPanel", () => {
  it("opens from the Targets button with the saved values, and closes on Esc", () => {
    const { getByRole, getByLabelText, container, queryByRole } = open();
    expect(getByRole("dialog", { name: "Targets" })).toBeTruthy();
    expect((getByLabelText("Ideal up to, minutes per hizb") as HTMLInputElement).value).toBe("10");
    expect((getByLabelText("Per 10 pages of a surah, most mistakes") as HTMLInputElement).value).toBe("3");
    expect((getByLabelText("Shamoon: Per juz") as HTMLInputElement).value).toBe("8");
    expect((getByLabelText("Shamoon: note") as HTMLInputElement).value).toBe("Joined late");
    expect(status(container)).toBe("No changes yet");
    expect(container.textContent).toContain("A juz counts as 2 hizb: ideal ≤ 20:00");
    expect(container.textContent?.toLowerCase()).not.toContain("gold");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(queryByRole("dialog")).toBeNull();
  });

  it("shows a time-band error inline and holds Save", () => {
    const { getByLabelText, getByRole, container } = open();
    fireEvent.change(getByLabelText("Good up to, minutes per hizb"), { target: { value: "8" } });
    expect(getByRole("alert").textContent).toBe("Ideal, Good and Acceptable minutes must be in order.");
    expect(getByLabelText("Good up to, minutes per hizb").getAttribute("aria-invalid")).toBe("true");
    expect((getByRole("button", { name: "Save targets" }) as HTMLButtonElement).disabled).toBe(true);
    expect(status(container)).toBe("Fix the marked boxes to save");
  });

  it("shows an override error on that student's card", () => {
    const { getByLabelText, container } = open();
    fireEvent.change(getByLabelText("Shamoon: Per hizb"), { target: { value: "1.5" } });
    const card = container.querySelector(`[data-override="${SHAMOON.id}"]`)!;
    expect(within(card as HTMLElement).getByRole("alert").textContent).toMatch(/blank for the class value/);
  });

  it("saves the class target with the FULL override list, then refreshes", async () => {
    const { getByLabelText, getByRole, container } = open();
    fireEvent.change(getByLabelText("Ideal up to, minutes per hizb"), { target: { value: "12" } });
    fireEvent.change(getByLabelText("Student"), { target: { value: ALI.id } });
    fireEvent.click(getByRole("button", { name: "Add override" }));
    fireEvent.change(getByLabelText("Abdallah Ghouse: Per juz"), { target: { value: "6" } });
    expect(status(container)).toBe("Unsaved: the page shows a preview");
    await act(async () => {
      fireEvent.click(getByRole("button", { name: "Save targets" }));
    });
    expect(saveTargets).toHaveBeenCalledWith(
      CLASS,
      { minutes: { ideal: 12, good: 15, acceptable: 20 }, limits: { hizb: 3, juz: 5, surah10: 3 } },
      [
        { studentId: SHAMOON.id, hizb: 5, juz: 8, surah10: null, note: "Joined late" },
        { studentId: ALI.id, hizb: null, juz: 6, surah10: null, note: null },
      ],
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("removes an override by leaving it out of the save", async () => {
    const { getByRole } = open();
    fireEvent.click(getByRole("button", { name: "Remove custom limits for Shamoon" }));
    await act(async () => {
      fireEvent.click(getByRole("button", { name: "Save targets" }));
    });
    expect(saveTargets).toHaveBeenCalledWith(CLASS, DEFAULT_CLASS_TARGET, []);
  });

  it("discards the draft back to the saved values", () => {
    const { getByLabelText, getByRole, container } = open();
    fireEvent.change(getByLabelText("Per hizb, most mistakes"), { target: { value: "4" } });
    expect(getByRole("button", { name: /Targets.*unsaved/ })).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "Discard" }));
    expect((getByLabelText("Per hizb, most mistakes") as HTMLInputElement).value).toBe("3");
    expect(status(container)).toBe("No changes yet");
  });

  it("says when the save fails", async () => {
    saveTargets.mockRejectedValueOnce(new Error("Not your class."));
    const { getByLabelText, getByRole } = open();
    fireEvent.change(getByLabelText("Per hizb, most mistakes"), { target: { value: "4" } });
    await act(async () => {
      fireEvent.click(getByRole("button", { name: "Save targets" }));
    });
    expect(getByRole("alert").textContent).toBe("Not your class.");
    expect(refresh).not.toHaveBeenCalled();
  });
});
