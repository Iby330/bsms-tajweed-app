// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup, act } from "@testing-library/react";
import { fromRow, groupIntoPages, type QuranWordRow } from "@/lib/quran/mushaf";
import { MistakeBoardHeat } from "./mistake-board-heat";
import { SurahJump } from "./surah-jump";
import { LiveHeatMushaf } from "./live-heat-mushaf";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, prefetch: vi.fn() }) }));

const row = (page: number, surah: number): QuranWordRow => ({
  surah_number: surah, ayah_number: 1, word_position: 1, text_uthmani: "كلمة",
  code_v1: "ﱁ", code_v2: null, is_end: false, page_number: page, line_number: 2,
});

beforeEach(() => {
  push.mockClear();
  window.history.replaceState(null, "", "/hifdh?heat=596");
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const page = Number(url.split("/").pop());
    return Response.json([row(page, 200 + page)]);
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// The programme's run, An-Nas first: a page's surah is the first in run
// order that starts on or before it.
const order = [
  { surah: 114, start: 604 },
  { surah: 90, start: 594 },
  { surah: 87, start: 591 },
];

function renderBoard() {
  return render(
    <MistakeBoardHeat
      note="Any surah on your run."
      picker={{
        options: order.map((o) => ({ surah: o.surah, name: `S${o.surah}`, count: 1 })),
        hrefFor: Object.fromEntries(order.map((o) => [o.surah, `/hifdh?heat=${o.surah}`])),
        closeHref: "/hifdh?heat=",
        order, pickLast: false, selected: 90, fallback: 114,
      }}
      mushaf={{
        page: 596, min: 562, max: 604, basePath: "/hifdh?heat=",
        pages: groupIntoPages([fromRow(row(596, 90))]), heat: {}, history: {}, surahNames: {}, tint: [],
      }}
    />,
  );
}
const picked = (el: HTMLElement) => (el.querySelector("select") as HTMLSelectElement).value;

describe("MistakeBoardHeat", () => {
  it("turns in place, and the picker follows the page into the next surah", async () => {
    const { container, getByLabelText } = renderBoard();
    expect(picked(container)).toBe("90");
    // back from 596 to 593: below Al-Balad's first page, inside Al-A'la's
    await act(async () => { fireEvent.click(getByLabelText("Previous page")); });
    await act(async () => { fireEvent.click(getByLabelText("Previous page")); });
    await act(async () => { fireEvent.click(getByLabelText("Previous page")); });
    expect(window.location.search).toBe("?heat=593");
    expect(picked(container)).toBe("87");
    expect(push).not.toHaveBeenCalled();
  });

  it("picking a surah while open turns to its first page in place", async () => {
    const { container } = renderBoard();
    await act(async () => {
      fireEvent.change(container.querySelector("select")!, { target: { value: "114" } });
    });
    expect(window.location.search).toBe("?heat=604");
    expect(picked(container)).toBe("114");
    expect(push).not.toHaveBeenCalled();
  });
});

describe("SurahJump", () => {
  it("hands the page over when given onPick", () => {
    const onPick = vi.fn();
    const { container } = render(
      <SurahJump basePath="/hifdh?tab=review" onPick={onPick}
        options={[{ number: 67, name: "Al-Mulk", page: 562 }]} />,
    );
    fireEvent.change(container.querySelector("select")!, { target: { value: "562" } });
    expect(onPick).toHaveBeenCalledWith(562);
    expect(push).not.toHaveBeenCalled();
  });
});

describe("LiveHeatMushaf on a surah page", () => {
  it("turns in place under `p`, with no chips", async () => {
    window.history.replaceState(null, "", "/hifdh/88");
    const { getByLabelText, container } = render(
      <LiveHeatMushaf page={592} min={562} max={604} basePath="/hifdh/88" param="p"
        pages={groupIntoPages([fromRow(row(592, 88))])} heat={{}} history={{}} tint={[]} />,
    );
    expect(container.querySelectorAll("a")).toHaveLength(0);
    await act(async () => { fireEvent.click(getByLabelText("Next page")); });
    expect(window.location.search).toBe("?p=593");
    expect(push).not.toHaveBeenCalled();
  });
});
