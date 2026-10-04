// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { TermTile } from "./term-tile";
import type { TermTile as Tile } from "@/lib/curriculum/catalogue";

afterEach(cleanup);

const base: Tile = {
  id: 1, startsOn: "2026-10-05", endsOn: "2026-11-26", isCurrent: true,
  open: true, href: "/courses/1", opensAt: null, progress: { done: 2, total: 5 },
  posters: ["vidA", "vidB"],
  courses: [
    { key: "ghunna", label: "Ghunna", href: "/courses/1/ghunna" },
    { key: "mudood", label: "Mudūd", href: null },
  ],
};

describe("TermTile", () => {
  it("links the term and only the courses that are open", () => {
    const { container, getByText } = render(<TermTile tile={base} />);
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/courses/1", "/courses/1/ghunna"]);
    expect(getByText("Mudūd").closest("a")).toBeNull();
    expect(getByText("Current term")).toBeTruthy();
    // the whole card opens the term
    expect(container.querySelector("article")!.classList.contains("linked")).toBe(true);
    // startsOn/endsOn are Postgres `date` columns, formatted in UTC (fmtDay).
    expect(getByText("5 Oct – 26 Nov")).toBeTruthy();
    expect(container.querySelector("article")?.classList.contains("current")).toBe(true);
  });

  it("has no link at all when the term has not opened", () => {
    const { container, getByText } = render(<TermTile tile={{
      ...base, id: 2, isCurrent: false, open: false, href: null, progress: null,
      opensAt: "2026-12-31T13:00:00Z",
      courses: [{ key: "sifaat_old", label: "Ṣifāt", href: null }],
    }} />);
    expect(container.querySelectorAll("a")).toHaveLength(0);
    expect(container.querySelector("article")!.classList.contains("linked")).toBe(false);
    // opensAt is a timestamptz, formatted in Europe/London (fmtStamp). The
    // match anchors on the end of the string since the lock glyph precedes
    // the text node inside the same <p>.
    expect(getByText(/^Opens /).textContent).toMatch(/Opens 31 Dec$/);
    expect(getByText("Ṣifāt")).toBeTruthy();
    expect(container.querySelector("h2")?.textContent).toMatch(/locked/);
  });

  it("names nothing for a term with no courses, only when it opens", () => {
    const { container } = render(<TermTile tile={{
      ...base, id: 3, isCurrent: false, open: false, href: null, progress: null,
      opensAt: "2027-03-11T13:00:00Z", courses: [],
    }} />);
    expect(container.querySelectorAll("li")).toHaveLength(0);
    expect(container.textContent).toMatch(/Opens /);
  });

  it("covers the tile with its videos' thumbnails, or the plate without", () => {
    const two = render(<TermTile tile={base} />);
    const imgs = [...two.container.querySelectorAll(".cover img")].map((i) => i.getAttribute("src"));
    expect(imgs).toEqual(["https://i.ytimg.com/vi/vidA/hqdefault.jpg", "https://i.ytimg.com/vi/vidB/hqdefault.jpg"]);
    expect(two.container.querySelector(".cover")!.classList.contains("duo")).toBe(true);
    cleanup();
    const none = render(<TermTile tile={{ ...base, posters: [] }} />);
    expect(none.container.querySelectorAll(".cover img")).toHaveLength(0);
    expect(none.container.querySelector(".cover .plate")!.textContent).toBe("Term 1");
  });
});
