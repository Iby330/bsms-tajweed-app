// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen, cleanup, waitFor, within, act } from "@testing-library/react";
import { groupIntoPages, type QuranWord } from "@/lib/quran/mushaf";
import { DEFAULT_CLASS_TARGET } from "@/lib/murajaah/targets";
import type { SessionView } from "@/lib/murajaah/sessions";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn(), prefetch: vi.fn() }) }));

const SID = "11111111-1111-4111-8111-111111111111";
const snap = (over: Record<string, unknown> = {}) => ({
  elapsed_ms: 0, running_since: null, timer_started_at: null, finished_at: null,
  server_now: new Date().toISOString(), ...over,
});
vi.mock("@/lib/murajaah/actions", () => ({
  startDraft: vi.fn(async () => SID),
  discardDraft: vi.fn(async () => {}),
  startClock: vi.fn(async () => snap({ running_since: new Date().toISOString(), timer_started_at: new Date().toISOString() })),
  pauseClock: vi.fn(async () => snap({ timer_started_at: new Date().toISOString(), elapsed_ms: 1000 })),
  resumeClock: vi.fn(async () => snap()),
  finishClock: vi.fn(async () => snap({ timer_started_at: "2026-11-10T10:00:00Z", finished_at: "2026-11-10T10:12:00Z", elapsed_ms: 720_000 })),
  addMark: vi.fn(async () => "mark-real-1"),
  removeMark: vi.fn(async () => {}),
  tickCheckpoint: vi.fn(async () => "cp-real-1"),
  untickCheckpoint: vi.fn(async () => {}),
  setMarkTypes: vi.fn(async () => {}),
  submitSession: vi.fn(async () => {}),
}));
import * as A from "@/lib/murajaah/actions";
import { ListenerScreen } from "./listener-screen";

const w = (over: Partial<QuranWord>): QuranWord => ({
  surah: 87, ayah: 1, position: 1, text: "سَبِّحِ", glyph: null, isEnd: false, page: 591, line: 3, ...over,
});
const pages = groupIntoPages([
  w({ surah: 86, ayah: 17, text: "رُوَيْدًۢا", line: 1 }),
  w({}),
  w({ position: 2, text: "ٱسْمَ" }),
  w({ position: 3, text: "١", isEnd: true }),
]);

const people = [{ id: "22222222-2222-4222-8222-222222222222", name: "Yunus Zafar" }, { id: "33333333-3333-4333-8333-333333333333", name: "Moadh Hwessa" }];

const view = (over: Partial<SessionView> = {}): SessionView => ({
  id: SID, classId: "c", listenerId: "me", listenerName: "Me",
  reciterId: people[0].id, reciterName: "Yunus Zafar",
  kind: "hizb", ns: [60], label: "Hizb 60", hizbEq: 1, mistakeLimit: 3,
  minutes: { ideal: 10, good: 15, acceptable: 20 }, createdAt: "2026-11-10T10:00:00Z",
  clock: { elapsed_ms: 0, running_since: null, timer_started_at: null, finished_at: null },
  submittedAt: null, note: null, marks: [], checkpoints: [], mistakes: 0, ...over,
});

const renderScreen = (initialDraft: SessionView | null = null, pg = pages) => render(
  <ListenerScreen
    people={people}
    initialDraft={initialDraft}
    serverNow={new Date().toISOString()}
    target={DEFAULT_CLASS_TARGET}
    overrides={[]}
    teacherName="Ustadh Mohamed"
    pages={pg}
    surahNames={{}}
    basePath="/hifdh?tab=review"
  />,
);

// Pages turn in place (use-live-pages): a turn fetches that page's words.
const fetchMock = vi.fn(async (url: string) => {
  const page = Number(url.split("/").pop());
  return Response.json([{
    surah_number: 87, ayah_number: 1, word_position: 1, text_uthmani: "سَبِّحِ",
    code_v1: null, code_v2: null, is_end: false, page_number: page, line_number: 3,
  }]);
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  window.history.replaceState(null, "", "/hifdh?tab=review");
  try { window.localStorage.clear(); } catch { /* none */ }
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SLOW = 20_000;
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe("ListenerScreen: choosing", () => {
  it("opens a draft once both the classmate and the portion are chosen, at the portion's first page", async () => {
    renderScreen(null, []);
    fireEvent.click(screen.getByRole("button", { name: /Choose a classmate/ }));
    fireEvent.click(screen.getByRole("button", { name: "Yunus Zafar" }));
    expect(A.startDraft).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Choose a portion/ }));
    const pop = screen.getByRole("dialog", { name: "Choose the portion" });
    fireEvent.click(within(pop).getByRole("button", { name: /^Juz 28,/ }));
    fireEvent.click(within(pop).getByRole("button", { name: /^Juz 30,/ }));
    expect(pop.textContent).toContain("Juz 28 + 30");
    expect(pop.textContent).toContain("Ideal ≤ 40:00");
    // No Apply: Esc closes and saves.
    fireEvent.keyDown(document, { key: "Escape" });
    await settle();
    expect(A.startDraft).toHaveBeenCalledWith(people[0].id, "juz", [28, 30]);
    // the portion's first page, turned to in place rather than navigated to
    await waitFor(() => expect(window.location.search).toBe("?tab=review&page=542"));
    expect(fetchMock).toHaveBeenCalledWith("/api/mushaf/542");
    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  }, SLOW);

  it("starts a new selection when another kind is picked, and says so", () => {
    renderScreen(null, []);
    fireEvent.click(screen.getByRole("button", { name: /Choose a portion/ }));
    const pop = screen.getByRole("dialog");
    fireEvent.click(within(pop).getByRole("button", { name: /^Juz 30,/ }));
    fireEvent.click(within(pop).getByRole("tab", { name: /Hizb/ }));
    expect(pop.textContent).toContain("Picking a hizb clears your juz selection.");
    fireEvent.click(within(pop).getByRole("button", { name: /^Hizb 59,/ }));
    expect(pop.textContent).toContain("New hizb selection: your juz selection was cleared.");
    expect(within(pop).getByRole("button", { name: /^Hizb 59,/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("finds a surah by name or number", () => {
    renderScreen(null, []);
    fireEvent.click(screen.getByRole("button", { name: /Choose a portion/ }));
    const pop = screen.getByRole("dialog");
    fireEvent.click(within(pop).getByRole("tab", { name: /Surah/ }));
    fireEvent.change(within(pop).getByRole("searchbox"), { target: { value: "mulk" } });
    expect(within(pop).getByRole("button", { name: "67. Al-Mulk" })).toBeTruthy();
    expect(within(pop).queryByRole("button", { name: "78. An-Naba" })).toBeNull();
  });

  it("asks inside the picker before starting over a session in progress", async () => {
    renderScreen(view({ marks: [{ id: "m1", atMs: 0, surah: null, ayah: null, position: null, category: null }] }));
    fireEvent.click(screen.getByRole("button", { name: "Yunus Zafar" }));
    fireEvent.click(screen.getByRole("button", { name: "Moadh Hwessa" }));
    const alert = within(screen.getByRole("dialog")).getByRole("alert");
    expect(alert.textContent).toContain("Start over with Moadh Hwessa? This clears the time, mistakes and checkpoints.");
    fireEvent.click(within(alert).getByRole("button", { name: "Keep current" }));
    expect(A.startDraft).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Yunus Zafar" }));
    fireEvent.click(screen.getByRole("button", { name: "Moadh Hwessa" }));
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    await settle();
    expect(A.startDraft).toHaveBeenCalledWith(people[1].id, "hizb", [60]);
  }, SLOW);
});

describe("ListenerScreen: listening", () => {
  it("shows the target and dims words outside the portion", () => {
    renderScreen(view());
    expect(screen.getAllByText("3 mistakes or fewer").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/set by Ustadh Mohamed/).length).toBeGreaterThan(0);
    const outside = screen.getByRole("button", { name: "رُوَيْدًۢا" });
    expect(outside.className).toMatch(/pointer-events-none/);
    fireEvent.click(outside);
    expect(A.addMark).not.toHaveBeenCalled();
  });

  it("a tap marks a word at once, the end marker marks the ayah, and a second tap removes it", async () => {
    renderScreen(view());
    const word = screen.getByRole("button", { name: "ٱسْمَ" });
    fireEvent.click(word);
    expect(word.className).toMatch(/bg-danger/);
    await settle();
    expect(A.addMark).toHaveBeenCalledWith(SID, 0, { surah: 87, ayah: 1, position: 2 });
    fireEvent.click(screen.getByRole("button", { name: "ٱسْمَ" }));
    await settle();
    expect(A.removeMark).toHaveBeenCalledWith("mark-real-1");

    fireEvent.click(screen.getByRole("button", { name: "Ayah 1" }));
    await settle();
    expect(A.addMark).toHaveBeenLastCalledWith(SID, 0, { surah: 87, ayah: 1, position: null });
  });

  it("+1 counts, Undo removes the latest, even before its save has answered", async () => {
    let answer: (id: string) => void = () => {};
    vi.mocked(A.addMark).mockImplementationOnce(() => new Promise<string>((r) => { answer = r; }));
    renderScreen(view());
    fireEvent.click(screen.getByRole("button", { name: /Mistake \+1 \(0 so far\)/ }));
    expect(screen.getByRole("button", { name: /Mistake \+1 \(1 so far\)/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Undo/ }));
    expect(screen.getByRole("button", { name: /Mistake \+1 \(0 so far\)/ })).toBeTruthy();
    await settle();
    expect(A.removeMark).not.toHaveBeenCalled();
    answer("late-id");
    await waitFor(() => expect(A.removeMark).toHaveBeenCalledWith("late-id"));
    expect(A.addMark).toHaveBeenCalledWith(SID, 0, null);
  });

  it("Space and M add a mistake; keys are ignored while typing", async () => {
    renderScreen(view());
    fireEvent.keyDown(window, { key: " " });
    fireEvent.keyDown(screen.getByRole("button", { name: "Finish" }), { key: "m" });
    await settle();
    expect(A.addMark).toHaveBeenCalledTimes(2);

    // Not from outside the screen (My revision has its own controls).
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    fireEvent.keyDown(outside, { key: " " });
    outside.remove();
    // Not while typing in the picker's search.
    fireEvent.click(screen.getByRole("button", { name: "Hizb 60" }));
    fireEvent.click(screen.getByRole("tab", { name: /Surah/ }));
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "m" });
    await settle();
    expect(A.addMark).toHaveBeenCalledTimes(2);
  });

  it("Start runs the server clock; checkpoints tick in order", async () => {
    renderScreen(view());
    expect(screen.getByRole("button", { name: /Tick Q1 · Al-A'la/ }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /^Start/ }));
    expect(screen.getByRole("button", { name: /^Pause/ })).toBeTruthy();
    await settle();
    expect(A.startClock).toHaveBeenCalledWith(SID);

    fireEvent.click(screen.getByRole("button", { name: /Tick Q1 · Al-A'la/ }));
    await settle();
    expect(A.tickCheckpoint).toHaveBeenCalledWith(SID, "auto", 1, "Q1 · Al-A'la", expect.any(Number));
    expect(screen.getByRole("button", { name: /Tick Q2 · Al-Balad/ })).toBeTruthy();
    // Q1 is done; ticking it turned the page to where Q2 starts.
    await waitFor(() => expect(window.location.search).toBe("?tab=review&page=594"));
    expect(push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Add checkpoint" }));
    await settle();
    expect(A.tickCheckpoint).toHaveBeenLastCalledWith(SID, "added", 0, "", expect.any(Number));
  });

  it("Finish asks for a second tap", async () => {
    renderScreen(view({ clock: { elapsed_ms: 5000, running_since: null, timer_started_at: "2026-11-10T10:00:00Z", finished_at: null } }));
    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    expect(A.finishClock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Tap again" }));
    await settle();
    expect(A.finishClock).toHaveBeenCalledWith(SID);
    expect(await screen.findByRole("heading", { name: "Session finished" })).toBeTruthy();
  });

  it("My own mushaf swaps the page for a large timer", () => {
    renderScreen(view());
    fireEvent.click(screen.getByRole("button", { name: "My own mushaf" }));
    expect(screen.getByText(/Following Yunus Zafar in your own mushaf/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "ٱسْمَ" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show the app mushaf" }));
    expect(screen.getByRole("button", { name: "ٱسْمَ" })).toBeTruthy();
  });

  it("remembers Left-handed", () => {
    renderScreen(view());
    fireEvent.click(screen.getByRole("button", { name: "Left-handed" }));
    expect(window.localStorage.getItem("murajaah:lefty")).toBe("1");
    cleanup();
    renderScreen(view());
    expect(screen.getByRole("button", { name: "Left-handed" }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("ListenerScreen: the summary", () => {
  const finished = view({
    clock: { elapsed_ms: 720_000, running_since: null, timer_started_at: "2026-11-10T10:00:00Z", finished_at: "2026-11-10T10:12:00Z" },
    marks: [
      { id: "mw", atMs: 60_000, surah: 87, ayah: 1, position: 2, category: null },
      { id: "ma", atMs: 90_000, surah: 87, ayah: 3, position: null, category: null },
      { id: "mp", atMs: 100_000, surah: null, ayah: null, position: null, category: null },
    ],
    checkpoints: [{ id: "c1", kind: "auto", ord: 1, label: "Q1 · Al-A'la", atMs: 200_000 }],
  });

  it("shows the verdict and splits, offers types (no makhraj on a whole ayah), then saves", async () => {
    renderScreen(finished);
    expect(screen.getByText("12:00")).toBeTruthy();
    expect(screen.getByText("Target met")).toBeTruthy();
    expect(screen.getByText("Q1 · Al-A'la")).toBeTruthy();
    const ayah = screen.getByRole("group", { name: /87:3, whole ayah/ });
    expect(within(ayah).queryByRole("button", { name: "Makhraj" })).toBeNull();
    const wordGroup = screen.getByRole("group", { name: /87:1, word 2/ });
    fireEvent.click(within(wordGroup).getByRole("button", { name: "Tajweed" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Strong" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(A.submitSession).toHaveBeenCalledWith(SID, "Strong"));
    expect(A.setMarkTypes).toHaveBeenCalledWith(SID, [{ markId: "mw", category: "tajweed" }]);
    expect(vi.mocked(A.setMarkTypes).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(A.submitSession).mock.invocationCallOrder[0]);
    const status = await screen.findByText(/^Saved: Yunus Zafar · Hizb 60 · 12:00 Good · 3 mistakes, target met/);
    expect(status).toBeTruthy();
    expect(screen.getByRole("button", { name: /Choose a classmate/ })).toBeTruthy();
  }, SLOW);

  it("Discard asks inline first", async () => {
    renderScreen(finished);
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(A.discardDraft).not.toHaveBeenCalled();
    const alert = screen.getByRole("alert");
    fireEvent.click(within(alert).getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(A.discardDraft).toHaveBeenCalledWith(SID));
  });
});
