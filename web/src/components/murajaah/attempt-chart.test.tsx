// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { AttemptChart } from "./attempt-chart";
import type { ChartBar } from "@/lib/murajaah/chart-data";

const MIN = 60_000;
const REF = { ideal: 20 * MIN, good: 30 * MIN, acceptable: 40 * MIN };

function bar(i: number, over: Partial<ChartBar> = {}): ChartBar {
  return {
    id: `s${i}`,
    date: `2026-10-${String(i).padStart(2, "0")}T18:00:00.000Z`,
    valueMs: 18 * MIN, totalMs: 18 * MIN, perUnit: null,
    label: "Juz 30", mistakes: 2, limit: 5, band: "ideal",
    ...over,
  };
}

const bars = (c: HTMLElement) => [...c.querySelectorAll<SVGRectElement>("rect[data-bar]")];

// No globals in vitest.config.ts, so testing-library never cleans up itself.
afterEach(cleanup);

describe("AttemptChart", () => {
  it("draws one bar per attempt, numbered 1, 2, 3 in date order", () => {
    const { container } = render(
      <AttemptChart bars={[bar(1), bar(2, { band: "good", valueMs: 25 * MIN, totalMs: 25 * MIN }), bar(3)]} refLines={REF} />,
    );
    expect(bars(container)).toHaveLength(3);
    const xs = [...container.querySelectorAll("[data-x-label]")].map((t) => t.textContent);
    expect(xs).toEqual(["1", "2", "3"]);
  });

  it("fills each bar with its band's token and nothing hard-coded", () => {
    const { container } = render(
      <AttemptChart
        bars={[bar(1), bar(2, { band: "good" }), bar(3, { band: "acceptable" }), bar(4, { band: "slow" })]}
        refLines={REF}
      />,
    );
    const fills = bars(container).map((b) => b.getAttribute("fill"));
    expect(fills[0]).toBe("var(--ok)");
    expect(fills[1]).toContain("var(--ok)");
    expect(fills[2]).toBe("var(--warn)");
    expect(fills[3]).toBe("var(--danger)");
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{6}\b/i);
  });

  it("labels the three band limits as dashed reference lines, Ideal not gold", () => {
    const { container } = render(<AttemptChart bars={[bar(1)]} refLines={REF} />);
    const refs = [...container.querySelectorAll("[data-ref]")];
    expect(refs.map((r) => r.textContent)).toEqual(["Ideal 20:00", "Good 30:00", "Acceptable 40:00"]);
    expect(container.querySelector("svg[role=group]")!.querySelectorAll("line[stroke-dasharray]").length).toBe(3);
    expect(container.textContent?.toLowerCase()).not.toContain("gold");
  });

  it("writes the mistakes on each bar, in the danger colour when over the limit", () => {
    const { container } = render(
      <AttemptChart bars={[bar(1, { mistakes: 2, limit: 5 }), bar(2, { mistakes: 7, limit: 5 })]} refLines={REF} />,
    );
    const counts = [...container.querySelectorAll<SVGTextElement>("[data-mistakes]")];
    expect(counts.map((t) => t.textContent)).toEqual(["2 ✕", "7 ✕"]);
    expect(counts[0].getAttribute("fill")).toBe("var(--muted-foreground)");
    expect(counts[1].getAttribute("fill")).toBe("var(--danger)");
  });

  it("emphasises the latest bar", () => {
    const { container } = render(<AttemptChart bars={[bar(1), bar(2)]} refLines={REF} />);
    expect(bars(container).map((b) => b.getAttribute("data-latest"))).toEqual([null, "true"]);
    expect(container.querySelector("[data-latest-outline]")).not.toBeNull();
  });

  it("names each bar in a <title> and an aria-label, with the per-unit time and the limit", () => {
    const { container } = render(
      <AttemptChart
        bars={[bar(1, { label: "Juz 28 + 30", totalMs: 50 * MIN, valueMs: 25 * MIN, perUnit: "juz", mistakes: 12, limit: 10, band: "good" })]}
        refLines={REF}
        perUnit="juz"
      />,
    );
    const b = bars(container)[0];
    const title = b.querySelector("title")?.textContent ?? "";
    expect(title).toContain("Attempt 1");
    expect(title).toContain("Juz 28 + 30");
    expect(title).toContain("1 Oct 2026");
    expect(title).toContain("50:00");
    expect(title).toContain("25:00 per juz");
    expect(title).toContain("Good");
    expect(title).toContain("12 mistakes, over the limit of 10");
    expect(b.getAttribute("aria-label")).toBe(title);
  });

  it("is keyboard-focusable and shows a tip on focus and hover", () => {
    const { container, queryByRole } = render(<AttemptChart bars={[bar(1), bar(2, { mistakes: 1 })]} refLines={REF} />);
    const [first, second] = bars(container);
    expect(first.getAttribute("tabindex")).toBe("0");
    expect(queryByRole("tooltip")).toBeNull();
    fireEvent.focus(first);
    expect(queryByRole("tooltip")?.textContent).toContain("Attempt 1");
    fireEvent.mouseEnter(second);
    expect(queryByRole("tooltip")?.textContent).toContain("1 mistake");
    fireEvent.mouseLeave(second);
    expect(queryByRole("tooltip")).toBeNull();
  });

  it("shows the latest 12 of many, numbered as attempts", () => {
    const many = Array.from({ length: 20 }, (_, i) => bar(i + 1));
    const { container } = render(<AttemptChart bars={many} refLines={REF} />);
    expect(bars(container)).toHaveLength(12);
    const xs = [...container.querySelectorAll("[data-x-label]")].map((t) => t.textContent);
    expect(xs[0]).toBe("9");
    expect(xs[11]).toBe("20");
    expect(container.textContent).toContain("Showing the last 12 of 20");
  });

  it("writes the y axis as clock times", () => {
    const { container } = render(<AttemptChart bars={[bar(1, { valueMs: 70 * MIN, totalMs: 70 * MIN, band: "slow" })]} refLines={REF} />);
    const ys = [...container.querySelectorAll("[data-y-label]")].map((t) => t.textContent ?? "");
    expect(ys[0]).toBe("0:00");
    expect(ys.some((y) => y === "1:00:00")).toBe(true);
    expect(ys.every((y) => /^\d+:\d\d(:\d\d)?$/.test(y))).toBe(true);
  });

  it("carries a table for screen readers", () => {
    const { container } = render(<AttemptChart bars={[bar(1), bar(2)]} refLines={REF} />);
    expect(container.querySelectorAll("table tbody tr")).toHaveLength(2);
  });

  it("says so when there are no attempts", () => {
    const { container } = render(<AttemptChart bars={[]} refLines={REF} />);
    expect(container.querySelector("svg")).toBeNull();
    expect(container.textContent).toContain("No attempts yet");
  });
});
