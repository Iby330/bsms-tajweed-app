// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { MushafPager } from "./mushaf-pager";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, prefetch: vi.fn() }) }));

beforeEach(() => push.mockClear());
afterEach(cleanup);

function renderPager(over: Partial<React.ComponentProps<typeof MushafPager>> = {}) {
  return render(
    <MushafPager page={5} min={1} max={10} basePath="/hifz/88?tab=read" param="p" {...over}>
      <div>page</div>
    </MushafPager>,
  );
}

describe("MushafPager arrows", () => {
  it("renders both arrows by accessible name", () => {
    const { getByRole } = renderPager();
    expect(getByRole("button", { name: "Next page" })).toBeTruthy();
    expect(getByRole("button", { name: "Previous page" })).toBeTruthy();
  });

  it("the next arrow pushes the higher page", () => {
    const { getByRole } = renderPager();
    fireEvent.click(getByRole("button", { name: "Next page" }));
    expect(push).toHaveBeenCalledWith("/hifz/88?tab=read&p=6", { scroll: false });
  });

  it("the previous arrow pushes the lower page", () => {
    const { getByRole } = renderPager();
    fireEvent.click(getByRole("button", { name: "Previous page" }));
    expect(push).toHaveBeenCalledWith("/hifz/88?tab=read&p=4", { scroll: false });
  });

  it("disables the previous arrow at the first page", () => {
    const { getByRole } = renderPager({ page: 1 });
    expect(getByRole("button", { name: "Previous page" })).toHaveProperty("disabled", true);
    expect(getByRole("button", { name: "Next page" })).toHaveProperty("disabled", false);
  });

  it("disables the next arrow at the last page", () => {
    const { getByRole } = renderPager({ page: 10 });
    expect(getByRole("button", { name: "Next page" })).toHaveProperty("disabled", true);
    expect(getByRole("button", { name: "Previous page" })).toHaveProperty("disabled", false);
  });

  it("a step of 2 turns a spread at a time", () => {
    const { getByRole } = renderPager({ step: 2 });
    fireEvent.click(getByRole("button", { name: "Next page" }));
    expect(push).toHaveBeenCalledWith("/hifz/88?tab=read&p=7", { scroll: false });
  });

  it("keeps the arrows off the page text below md", () => {
    const { getByRole } = renderPager();
    const next = getByRole("button", { name: "Next page" });
    expect(next.className).not.toMatch(/(^|\s)absolute/);
    expect(next.className).toMatch(/md:absolute/);
  });
});
