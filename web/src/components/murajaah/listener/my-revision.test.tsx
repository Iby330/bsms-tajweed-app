// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DEFAULT_CLASS_TARGET } from "@/lib/murajaah/targets";
import { session } from "@/components/murajaah/session-fixtures";

vi.mock("@/lib/murajaah/queries", () => ({
  sessionsAsReciter: vi.fn(async () => [
    session({ at: "2026-11-01", label: "Juz 30", listenerName: "Yunus Zafar" }),
    session({ at: "2026-11-08", label: "Juz 30", listenerName: "Moadh Hwessa" }),
  ]),
  overrideFor: vi.fn(async () => null),
}));
import { sessionsAsReciter, overrideFor } from "@/lib/murajaah/queries";
import { MyRevision } from "./my-revision";

afterEach(cleanup);

describe("MyRevision", () => {
  it("lists my attempts as the reciter, newest first, under a progress chart", async () => {
    render(await MyRevision({ studentId: "me", classId: "c1", target: DEFAULT_CLASS_TARGET }));
    expect(sessionsAsReciter).toHaveBeenCalledWith("me");
    expect(overrideFor).toHaveBeenCalledWith("c1", "me");
    expect(screen.getByText("My revision")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Progress by attempt" })).toBeTruthy();
    const rows = screen.getByRole("region", { name: "My attempts" }).querySelectorAll("li[data-session]");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("Moadh Hwessa");
    expect(rows[1].textContent).toContain("Yunus Zafar");
  });
});
