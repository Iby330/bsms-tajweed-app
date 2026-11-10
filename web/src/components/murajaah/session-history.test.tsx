// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { SessionHistory } from "./session-history";
import { counterMarks, MIN, session, timed } from "./session-fixtures";

afterEach(cleanup);

const rows = (c: HTMLElement) => [...c.querySelectorAll<HTMLLIElement>("li[data-session]")];

describe("SessionHistory", () => {
  const older = timed(25 * MIN, { at: "2026-10-01", mistakes: 2 });
  const newer = timed(16 * MIN + 20_000, {
    at: "2026-11-04T18:40:00.000Z",
    mistakes: 0,
    marks: [...counterMarks(2, "hifz"), ...counterMarks(1, "tajweed"), ...counterMarks(1)],
    // Hizb 59 ticked at 7:00; the rest runs to Finish.
    checkpoints: [{ id: "cp1", kind: "auto", ord: 1, label: "End of Hizb 59", atMs: 7 * MIN }],
    note: "Strong finish",
  });
  const surah = timed(4 * MIN, { at: "2026-10-10", kind: "surah", ns: [36], label: "Ya-Sin", hizbEq: 0.6, mistakeLimit: 2, mistakes: 3 });

  it("lists attempts newest first, numbered per portion, with date and time", () => {
    const { container } = render(<SessionHistory sessions={[older, surah, newer]} show="listener" />);
    const r = rows(container);
    expect(r.map((x) => x.dataset.session)).toEqual([newer.id, surah.id, older.id]);
    expect(r[0].textContent).toContain("Wed 4 Nov");
    expect(r[0].textContent).toContain("18:40");
    expect(r[0].textContent).toContain("Juz 30 · attempt 2");
    expect(r[2].textContent).toContain("Juz 30 · attempt 1");
    expect(container.textContent).toContain("3 attempts, newest first");
  });

  it("judges each row on its own snapshot: band pill and mistakes vs limit", () => {
    const { container } = render(<SessionHistory sessions={[newer, surah]} show="listener" />);
    const [a, b] = rows(container);
    expect(a.querySelector("[data-band]")?.getAttribute("data-band")).toBe("ideal");
    expect(a.textContent).toContain("16:20");
    expect(a.textContent).toContain("4/ 5met");
    // Ya-Sin: 3 mistakes on a snapshot limit of 2 is over.
    expect(b.querySelector("[data-over]")).not.toBeNull();
    expect(b.textContent).toContain("over");
  });

  it("names the listener or the reciter, as asked", () => {
    const one = render(<SessionHistory sessions={[newer]} show="listener" />);
    expect(one.container.textContent).toContain("Listened to by Yunus Zafar");
    cleanup();
    const two = render(<SessionHistory sessions={[newer]} show="reciter" />);
    expect(two.container.textContent).toContain("Recited by Abdallah Ghouse");
  });

  it("expands a row to its splits, mistake types and note", () => {
    const { container } = render(<SessionHistory sessions={[newer]} show="listener" />);
    const btn = within(rows(container)[0]).getByRole("button");
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    const splits = [...container.querySelectorAll("[data-splits] li")];
    expect(splits).toHaveLength(2);
    expect(splits[0].textContent).toContain("End of Hizb 59");
    expect(splits[0].textContent).toContain("7:00");
    expect(splits[0].querySelector("[data-band]")?.getAttribute("data-band")).toBe("ideal");
    const types = container.querySelector("[data-types]")!.textContent;
    expect(types).toContain("Hifdh 2");
    expect(types).toContain("Tajweed 1");
    expect(types).toContain("Makhraj 0");
    expect(types).toContain("Untyped 1");
    expect(types).not.toContain("Fluency");
    expect(container.textContent).toContain("Strong finish");
    fireEvent.click(btn);
    expect(container.querySelector("[data-splits]")).toBeNull();
  });

  it("says a one-piece attempt has no checkpoints", () => {
    const { container } = render(<SessionHistory sessions={[surah]} show="listener" />);
    fireEvent.click(within(rows(container)[0]).getByRole("button"));
    expect(container.textContent).toContain("Logged as one piece, without checkpoints.");
  });

  it("skips drafts and shows the empty text", () => {
    const draft = session({ submittedAt: null });
    const { container } = render(<SessionHistory sessions={[draft]} show="listener" emptyText="Nothing saved yet." />);
    expect(rows(container)).toHaveLength(0);
    expect(container.textContent).toContain("Nothing saved yet.");
  });
});
