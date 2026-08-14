// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup, screen } from "@testing-library/react";
import { SessionCalendar } from "./session-calendar";

// The grid is what's under test, not the router.
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

/** Open the popover and return the day cells of the month on show. */
function openGrid() {
  fireEvent.click(screen.getByRole("button", { name: /Mon, 5 Oct 2026/ }));
  // Weekday headers are spans; every numbered cell is one of these.
  return Array.from(document.querySelectorAll("button, span")).filter((el) =>
    /^\d{1,2}$/.test(el.textContent ?? ""),
  );
}

beforeEach(() => push.mockClear());
afterEach(cleanup);

describe("SessionCalendar", () => {
  const setup = (value = "2026-10-05") =>
    render(<SessionCalendar value={value} today="2026-10-05" basePath="/teacher/attendance" />);

  it("shows the whole month, not just the lesson days", () => {
    setup();
    const days = openGrid().map((el) => el.textContent);
    // October 2026 has 31 days and every one of them is on the calendar.
    expect(days).toHaveLength(31);
    expect(days[0]).toBe("1");
    expect(days[30]).toBe("31");
  });

  it("makes only Mondays and Thursdays selectable", () => {
    setup();
    const selectable = openGrid()
      .filter((el) => el.tagName === "BUTTON")
      .map((el) => Number(el.textContent));
    // Oct 2026: Mondays 5/12/19/26, Thursdays 1/8/15/22/29 — but 1 Oct falls
    // before the year opens on the 5th, so it is not offered.
    expect(selectable).toEqual([5, 8, 12, 15, 19, 22, 26, 29]);
  });

  it("renders every other day as inert text rather than a dead button", () => {
    setup();
    const inert = openGrid()
      .filter((el) => el.tagName !== "BUTTON")
      .map((el) => Number(el.textContent));
    expect(inert).toContain(6); // Tuesday
    expect(inert).toContain(7); // Wednesday
    expect(inert).toContain(10); // Saturday
    expect(inert).toContain(1); // Thursday, but before the year starts
  });

  it("navigates to the date that was picked", () => {
    setup();
    const thursday = openGrid().find((el) => el.tagName === "BUTTON" && el.textContent === "8")!;
    fireEvent.click(thursday);
    expect(push).toHaveBeenCalledWith("/teacher/attendance?date=2026-10-08");
  });

  it("cannot page back before the year starts", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Mon, 5 Oct 2026/ }));
    expect((screen.getByLabelText("Previous month") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Next month") as HTMLButtonElement).disabled).toBe(false);
  });
});
