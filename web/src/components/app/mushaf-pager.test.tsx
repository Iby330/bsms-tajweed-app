// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { MushafPager } from "./mushaf-pager";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, prefetch: vi.fn() }) }));

beforeEach(() => {
  vi.useFakeTimers();
  push.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// The pager owns only pointer/wheel gestures on the wrapper around its
// children — a plain div stands in for the mushaf page itself.
function renderPager(over: Partial<React.ComponentProps<typeof MushafPager>> = {}) {
  const utils = render(
    <MushafPager
      page={5}
      min={1}
      max={10}
      basePath="/hifdh/88"
      param="p"
      {...over}
    >
      <div data-testid="page">page</div>
    </MushafPager>,
  );
  const surface = utils.getByTestId("page").parentElement as HTMLElement;
  return { ...utils, surface };
}

describe("MushafPager", () => {
  it("drag right pushes the next page (forward)", () => {
    const { surface } = renderPager();
    fireEvent.pointerDown(surface, { clientX: 100 });
    fireEvent.pointerUp(surface, { clientX: 200 });
    expect(push).toHaveBeenCalledWith("/hifdh/88?p=6", { scroll: false });
  });

  it("drag left pushes the previous page (back)", () => {
    const { surface } = renderPager();
    fireEvent.pointerDown(surface, { clientX: 200 });
    fireEvent.pointerUp(surface, { clientX: 100 });
    expect(push).toHaveBeenCalledWith("/hifdh/88?p=4", { scroll: false });
  });

  it("a horizontal wheel gesture with deltaX < 0 turns the page forward", () => {
    const { surface } = renderPager();
    fireEvent.wheel(surface, { deltaX: -60, deltaY: 0 });
    expect(push).toHaveBeenCalledWith("/hifdh/88?p=6", { scroll: false });
  });

  it("a horizontal wheel gesture with deltaX > 0 turns the page back", () => {
    const { surface } = renderPager();
    fireEvent.wheel(surface, { deltaX: 60, deltaY: 0 });
    expect(push).toHaveBeenCalledWith("/hifdh/88?p=4", { scroll: false });
  });

  it("debounces a continuous swipe: a second wheel turn within 600ms is ignored", () => {
    const { surface } = renderPager();
    fireEvent.wheel(surface, { deltaX: -60, deltaY: 0 });
    expect(push).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);
    fireEvent.wheel(surface, { deltaX: -60, deltaY: 0 });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("allows another turn once the debounce window passes", () => {
    const { surface } = renderPager();
    fireEvent.wheel(surface, { deltaX: -60, deltaY: 0 });
    expect(push).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(600);
    fireEvent.wheel(surface, { deltaX: -60, deltaY: 0 });
    expect(push).toHaveBeenCalledTimes(2);
  });

  it("a vertical-dominant wheel event does nothing", () => {
    const { surface } = renderPager();
    fireEvent.wheel(surface, { deltaX: 40, deltaY: 200 });
    expect(push).not.toHaveBeenCalled();
  });

  it("a forward gesture at the max page does nothing", () => {
    const { surface } = renderPager({ page: 10, max: 10 });
    fireEvent.pointerDown(surface, { clientX: 100 });
    fireEvent.pointerUp(surface, { clientX: 200 });
    expect(push).not.toHaveBeenCalled();
  });
});

describe("MushafPager arrows", () => {
  it("renders both arrows by accessible name", () => {
    const { getByRole } = renderPager();
    expect(getByRole("button", { name: "Next page" })).toBeTruthy();
    expect(getByRole("button", { name: "Previous page" })).toBeTruthy();
  });

  it("the next arrow pushes the higher page", () => {
    const { getByRole } = renderPager();
    fireEvent.click(getByRole("button", { name: "Next page" }));
    expect(push).toHaveBeenCalledWith("/hifdh/88?p=6", { scroll: false });
  });

  it("the previous arrow pushes the lower page", () => {
    const { getByRole } = renderPager();
    fireEvent.click(getByRole("button", { name: "Previous page" }));
    expect(push).toHaveBeenCalledWith("/hifdh/88?p=4", { scroll: false });
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
    expect(push).toHaveBeenCalledWith("/hifdh/88?p=7", { scroll: false });
  });

  it("keeps the arrows off the page text below md", () => {
    const { getByRole } = renderPager();
    const next = getByRole("button", { name: "Next page" });
    expect(next.className).not.toMatch(/(^|\s)absolute/);
    expect(next.className).toMatch(/md:absolute/);
  });
});
