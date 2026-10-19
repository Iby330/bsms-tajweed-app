// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";

const save = vi.hoisted(() => vi.fn(async () => ({ ok: true as const })));
vi.mock("@/lib/attendance/actions", () => ({ saveRegister: save }));
import { AttendanceRegister, type RegisterRecord } from "./attendance-register";

afterEach(() => {
  cleanup();
  save.mockClear();
});

const STUDENTS = [{ id: "a", full_name: "Adam" }, { id: "b", full_name: "Bilal" }];
const register = (records: RegisterRecord[] = []) =>
  render(
    <AttendanceRegister
      classId="c1" termId={1} sessionDate="2026-10-19" sessionType="tajweed"
      students={STUDENTS} records={records}
    />,
  );
const rowOf = (name: string) => screen.getByRole("group", { name: `${name}'s attendance` });
const press = (name: string, mark: "Present" | "Late" | "Absent") =>
  fireEvent.click(within(rowOf(name)).getByRole("button", { name: mark }));

describe("AttendanceRegister: late", () => {
  it("saves a late student as present and late", async () => {
    register();
    press("Adam", "Late");
    press("Bilal", "Present");
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
    await vi.waitFor(() => expect(save).toHaveBeenCalled());
    const rows = (save.mock.calls[0] as unknown as [{ rows: { studentId: string; present: boolean; late: boolean }[] }])[0].rows;
    expect(rows.find((r) => r.studentId === "a")).toMatchObject({ present: true, late: true });
    expect(rows.find((r) => r.studentId === "b")).toMatchObject({ present: true, late: false });
  });

  it("counts late among the present, and says how many", () => {
    register();
    press("Adam", "Late");
    press("Bilal", "Present");
    expect(screen.getByText("(1 late)")).toBeTruthy();
  });

  it("asks for no reason or strike for a late student", () => {
    register();
    press("Adam", "Late");
    expect(screen.queryByPlaceholderText(/Reason/)).toBeNull();
    expect(screen.queryByText("Issue a strike")).toBeNull();
  });

  it("shows a saved late mark as Late, and treats Present as a change", () => {
    register([{ student_id: "a", present: true, late: true, absence_reason: null, strike_id: null }]);
    expect(within(rowOf("Adam")).getByRole("button", { name: "Late" }).getAttribute("aria-pressed")).toBe("true");
    press("Adam", "Present");
    expect(screen.getByRole("button", { name: /^Save changes \(1\)/ })).toBeTruthy();
  });

  it("drops late when the student is marked absent", async () => {
    register([{ student_id: "a", present: true, late: true, absence_reason: null, strike_id: null }]);
    press("Adam", "Absent");
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
    await vi.waitFor(() => expect(save).toHaveBeenCalled());
    const rows = (save.mock.calls[0] as unknown as [{ rows: { present: boolean; late: boolean }[] }])[0].rows;
    expect(rows[0]).toMatchObject({ present: false, late: false });
  });
});
