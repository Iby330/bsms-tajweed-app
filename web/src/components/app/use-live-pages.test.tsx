// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import type { QuranWordRow } from "@/lib/quran/mushaf";
import type { MistakeRow } from "@/lib/hifz/mistakes";
import { useLivePages, type LivePager } from "./use-live-pages";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const row = (page: number, surah: number, ayah: number, position: number): QuranWordRow => ({
  surah_number: surah, ayah_number: ayah, word_position: position, text_uthmani: "كلمة",
  code_v1: "ﱁ", code_v2: null, is_end: false, page_number: page, line_number: 2,
});

// Distinct surahs per page so the module-wide cache never answers one test
// with another's rows.
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  push.mockClear();
  window.history.replaceState(null, "", "/teacher/hifdh?tab=hear&student=s1&p=10");
  fetchMock = vi.fn(async (url: string) => {
    const page = Number(url.split("/").pop());
    if (page === 99) return new Response("{}", { status: 500 });
    return Response.json([row(page, 100 + page, 1, 1), row(page, 100 + page, 1, 2)]);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mark = (surah: number): MistakeRow => ({
  id: "m1", session_id: "old", surah_number: surah, ayah_number: 1, word_position: 2,
  category: "hifz", detail: "forgot", note: null, created_at: new Date().toISOString(),
});

function setup(live: Partial<LivePager> = {}) {
  const given = { pages: [], heat: {}, history: {} };
  return renderHook(() =>
    useLivePages(given, { page: 10, min: 5, max: 100, param: "p", ...live }),
  );
}

describe("useLivePages", () => {
  it("turns in place: the new page's words, tinted from earlier marks, and the URL keeps up", async () => {
    const { result } = setup({ tint: [mark(111)] });
    await act(() => result.current.turn!(11));

    expect(result.current.view.page).toBe(11);
    expect(result.current.view.pages[0].page).toBe(11);
    expect(result.current.view.pages[0].lines[0].words.map((w) => w.surah)).toEqual([111, 111]);
    // the earlier mark on 111:1:2 tints that word — as the server would
    expect(Object.keys(result.current.view.heat)).toContain("111:1:2");
    expect(window.location.search).toBe("?tab=hear&student=s1&p=11");
    expect(push).not.toHaveBeenCalled();
    expect(result.current.turning).toBe(false);
  });

  it("leaves the page plain without a tint", async () => {
    const { result } = setup();
    await act(() => result.current.turn!(41));
    expect(result.current.view.page).toBe(41);
    expect(result.current.view.heat).toEqual({});
  });

  it("prefetches both neighbours of the page it lands on", async () => {
    const { result } = setup();
    await act(() => result.current.turn!(21));
    const asked = fetchMock.mock.calls.map(([u]) => u);
    expect(asked).toEqual(expect.arrayContaining(["/api/mushaf/20", "/api/mushaf/21", "/api/mushaf/22"]));
  });

  it("asks for a page once, however often it is turned to", async () => {
    const { result } = setup();
    await act(() => result.current.turn!(31));
    await act(() => result.current.turn!(32));
    await act(() => result.current.turn!(31));
    expect(fetchMock.mock.calls.filter(([u]) => u === "/api/mushaf/31")).toHaveLength(1);
  });

  it("stays inside the range", async () => {
    const { result } = setup({ min: 5, max: 12 });
    await act(() => result.current.turn!(13));
    expect(result.current.view.page).toBe(10);
    expect(fetchMock).not.toHaveBeenCalledWith("/api/mushaf/13");
  });

  it("falls back to navigating when the page cannot be fetched", async () => {
    const { result } = setup();
    await act(() => result.current.turn!(99));
    expect(push).toHaveBeenCalledWith("/teacher/hifdh?tab=hear&student=s1&p=99", { scroll: false });
    expect(result.current.view.page).toBe(10);
  });

  it("is inert without a live pager", () => {
    const { result } = renderHook(() => useLivePages({ pages: [] }, undefined));
    expect(result.current.turn).toBeUndefined();
  });
});
