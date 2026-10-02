import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, prefetch: vi.fn() }) }));

import { SurahPicker } from "./mistake-board-parts";

const options = [
  { surah: 89, name: "Al-Fajr", count: 11 },
  { surah: 90, name: "Al-Balad", count: 9 },
];
const hrefFor = { 89: "/hifdh?heat=89#heatmap", 90: "/hifdh?heat=90#heatmap" };

describe("SurahPicker", () => {
  beforeEach(() => { cleanup(); push.mockClear(); });

  it("closed: choosing a surah waits for Open", () => {
    render(<SurahPicker options={options} selected={89} hrefFor={hrefFor} open={false} closeHref="/hifdh#heatmap" />);
    fireEvent.change(screen.getByLabelText("Surah"), { target: { value: "90" } });
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(push).toHaveBeenCalledWith("/hifdh?heat=90#heatmap", { scroll: false });
  });

  it("open: the button closes, and choosing a surah opens it straight away", () => {
    render(<SurahPicker options={options} selected={89} hrefFor={hrefFor} open closeHref="/hifdh#heatmap" />);
    fireEvent.change(screen.getByLabelText("Surah"), { target: { value: "90" } });
    expect(push).toHaveBeenLastCalledWith("/hifdh?heat=90#heatmap", { scroll: false });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(push).toHaveBeenLastCalledWith("/hifdh#heatmap", { scroll: false });
  });
});
