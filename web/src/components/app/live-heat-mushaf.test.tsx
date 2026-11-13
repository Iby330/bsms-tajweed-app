// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup, act } from "@testing-library/react";
import type { QuranWordRow } from "@/lib/quran/mushaf";
import { fromRow, groupIntoPages } from "@/lib/quran/mushaf";
import { LiveHeatMushaf } from "./live-heat-mushaf";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, prefetch: vi.fn() }) }));

const row = (page: number, surah: number): QuranWordRow => ({
  surah_number: surah, ayah_number: 1, word_position: 1, text_uthmani: "كلمة",
  code_v1: "ﱁ", code_v2: null, is_end: false, page_number: page, line_number: 2,
});
// Pages 570 and 580 hold surahs 70 and 80 — far from the hook's own test pages.
const SURAH_ON = { 570: 70, 580: 80 } as Record<number, number>;

beforeEach(() => {
  push.mockClear();
  window.history.replaceState(null, "", "/teacher/hifdh?tab=hear&student=s1&p=590");
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const page = Number(url.split("/").pop());
    return Response.json([row(page, SURAH_ON[page] ?? 1)]);
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderBoard() {
  return render(
    <LiveHeatMushaf
      page={570} min={562} max={604} basePath="/teacher/hifdh?tab=hear&student=s1&p=590"
      pages={groupIntoPages([fromRow(row(570, 70))])} heat={{}} history={{}} surahNames={{}}
      tint={[]}
      chips={[{ surah: 70, label: "Al-Ma'arij · 2", page: 570 }, { surah: 80, label: "Abasa · 1", page: 580 }]}
    />,
  );
}

describe("LiveHeatMushaf", () => {
  it("lights the chip of the surah on the page", () => {
    const { getByText } = renderBoard();
    expect(getByText("Al-Ma'arij · 2").className).toContain("bg-primary");
    expect(getByText("Abasa · 1").className).not.toContain("bg-primary");
  });

  it("a chip turns the mushaf in place, moves the light, and leaves the hearing's page alone", async () => {
    const { getByText } = renderBoard();
    await act(async () => { fireEvent.click(getByText("Abasa · 1")); });
    await act(async () => {}); // the fetch settles

    expect(getByText("Abasa · 1").className).toContain("bg-primary");
    expect(getByText("Al-Ma'arij · 2").className).not.toContain("bg-primary");
    expect(push).not.toHaveBeenCalled();
    // its own param moved; the logger's `p` stayed where that pager left it
    expect(window.location.search).toBe("?tab=hear&student=s1&p=590&heat=580");
  });

  it("a chip is still a link for a new-tab click", () => {
    const { getByText } = renderBoard();
    expect(getByText("Abasa · 1").getAttribute("href")).toBe("/teacher/hifdh?tab=hear&student=s1&p=590&heat=580");
  });
});
