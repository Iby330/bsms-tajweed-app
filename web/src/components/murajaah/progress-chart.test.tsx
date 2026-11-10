// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ProgressChart } from "./progress-chart";
import { MIN, timed } from "./session-fixtures";
import { DEFAULT_CLASS_TARGET, type ClassTarget } from "@/lib/murajaah/targets";

afterEach(cleanup);

const bars = (c: HTMLElement) => [...c.querySelectorAll<SVGRectElement>("rect[data-bar]")];
const caption = (c: HTMLElement) => c.querySelector("[data-caption]")?.textContent ?? "";

const juz1 = timed(21 * MIN + 34_000, { at: "2026-09-23", mistakes: 3 });
const juz2 = timed(16 * MIN + 20_000, { at: "2026-11-04", mistakes: 3 });
const hizb = timed(10 * MIN + 5_000, { at: "2026-11-07", kind: "hizb", ns: [59], label: "Hizb 59", hizbEq: 1, mistakes: 1 });

describe("ProgressChart", () => {
  it("offers All juz, All hizb, then single portions, and opens on All juz", () => {
    const { getByLabelText, container } = render(
      <ProgressChart sessions={[juz1, juz2, hizb]} target={DEFAULT_CLASS_TARGET} />,
    );
    const select = getByLabelText("Portion") as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual([
      "All juz (2 attempts)",
      "All hizb (1 attempt)",
      "Hizb 59 (1 attempt)",
      "Juz 30 (2 attempts)",
    ]);
    expect(select.value).toBe("all-juz");
    expect(bars(container)).toHaveLength(2);
  });

  it("captions the latest attempt and the change since attempt 1, per juz", () => {
    const { container } = render(<ProgressChart sessions={[juz1, juz2]} target={DEFAULT_CLASS_TARGET} />);
    expect(caption(container)).toBe(
      "Attempt 2 (Juz 30), 4 Nov: 16:20 (ideal) and 3 mistakes, within the limit of 5. Since attempt 1: 5:14 per juz faster, same mistakes.",
    );
  });

  it("switches view from the select, and says when there is only one attempt", () => {
    const { getByLabelText, container } = render(
      <ProgressChart sessions={[juz1, juz2, hizb]} target={DEFAULT_CLASS_TARGET} />,
    );
    fireEvent.change(getByLabelText("Portion"), { target: { value: "Hizb 59" } });
    expect(bars(container)).toHaveLength(1);
    expect(caption(container)).toBe(
      "Attempt 1, 7 Nov: 10:05 (good) and 1 mistake, within the limit of 3. Only one attempt on this portion so far.",
    );
  });

  it("judges bars by the target it is given, so an unsaved edit previews", () => {
    const strict: ClassTarget = { minutes: { ideal: 4, good: 6, acceptable: 8 }, limits: { hizb: 3, juz: 2, surah10: 3 } };
    const { container, rerender } = render(<ProgressChart sessions={[juz2]} target={DEFAULT_CLASS_TARGET} />);
    expect(bars(container)[0].getAttribute("fill")).toBe("var(--ok)");
    rerender(<ProgressChart sessions={[juz2]} target={strict} />);
    expect(bars(container)[0].getAttribute("fill")).toBe("var(--danger)");
    expect(caption(container)).toContain("(too slow) and 3 mistakes, over the limit of 2.");
  });

  it("applies a student's override to the mistake limit", () => {
    const { container } = render(
      <ProgressChart sessions={[juz2]} target={DEFAULT_CLASS_TARGET} override={{ hizb: null, juz: 8, surah10: null }} />,
    );
    expect(caption(container)).toContain("within the limit of 8");
  });

  it("shows an empty state with no saved attempts, and never says gold", () => {
    const { container, queryByLabelText } = render(<ProgressChart sessions={[]} target={DEFAULT_CLASS_TARGET} />);
    expect(queryByLabelText("Portion")).toBeNull();
    expect(container.textContent).toContain("No attempts yet");
    expect(container.textContent?.toLowerCase()).not.toContain("gold");
  });
});
