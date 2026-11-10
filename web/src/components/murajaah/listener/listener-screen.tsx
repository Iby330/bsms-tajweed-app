"use client";

/**
 * The murāja'ah listener screen (design C "Thumb rail"), for the Esteemed
 * Ustadhs: one classmate recites a portion, the listener times them, marks
 * their mistakes and ticks checkpoints, then saves.
 *
 * - The title line picks who and what. Once both are chosen a draft opens on
 *   the server (startDraft), so a reload or a second device resumes it.
 * - The mushaf opens at the selection's first page; words outside it are
 *   dimmed and can't be tapped. A tap marks a word at once (the end marker
 *   marks the whole ayah); tapping it again removes the mark.
 * - "My own mushaf" swaps the page for a large timer, for a listener
 *   following in print.
 * - Finish shows the summary; Save writes it and the screen resets for the
 *   next person.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MushafReader, type SurahNames } from "@/components/app/mushaf-reader";
import { MushafPager } from "@/components/app/mushaf-pager";
import { BAND_LABEL, BAND_TONE, bandOf, formatClock } from "@/lib/murajaah/bands";
import { clockPhase } from "@/lib/murajaah/clock";
import { inRanges, rangesOf } from "@/lib/murajaah/portions";
import type { SessionView } from "@/lib/murajaah/sessions";
import { mistakeLimitFor, type ClassTarget, type OverrideInput } from "@/lib/murajaah/targets";
import type { MushafPage, QuranWord } from "@/lib/quran/mushaf";
import { cn } from "@/lib/utils";
import { FinishSummary, markPlace } from "./finish-summary";
import {
  checkpointRows, dimHeat, isDirty, latestMark, limitLine, locationOf, markMap,
  pageRangeOf, shortcutOf, timeHint, type Selection,
} from "./listener-logic";
import { SessionControls } from "./session-controls";
import { idealLine, TitleLine } from "./title-line";
import { useListenerSession, type Reciter, type SavedResult } from "./use-listener-session";

const LEFTY_KEY = "murajaah:lefty";

function readLefty(): boolean {
  try {
    return window.localStorage.getItem(LEFTY_KEY) === "1";
  } catch {
    return false;
  }
}
function writeLefty(on: boolean) {
  try {
    window.localStorage.setItem(LEFTY_KEY, on ? "1" : "0");
  } catch {
    /* private mode: it just isn't remembered */
  }
}

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

export function ListenerScreen({
  people, initialDraft, serverNow, target, overrides, teacherName, pages, surahNames, basePath,
}: {
  people: Reciter[];
  initialDraft: SessionView | null;
  serverNow: string;
  target: ClassTarget;
  overrides: OverrideInput[];
  /** "Ustadh Mohamed". */
  teacherName: string;
  /** The page the server loaded (one), or none before a portion is chosen. */
  pages: MushafPage[];
  surahNames: SurahNames;
  /** The Review tab's own URL, e.g. "/hifdh?tab=review". */
  basePath: string;
}) {
  const router = useRouter();
  const limitFor = useCallback((reciterId: string, sel: Selection) => {
    const o = overrides.find((x) => x.studentId === reciterId) ?? null;
    return mistakeLimitFor(sel.kind, sel.ns, target, o);
  }, [overrides, target]);

  const s = useListenerSession({ initial: initialDraft, serverNow, limitFor, minutes: target.minutes });
  const { draft } = s;

  // What's chosen before a draft exists (and kept for the next person after Save).
  const [chosenReciter, setChosenReciter] = useState<Reciter | null>(null);
  const [chosenSel, setChosenSel] = useState<Selection | null>(null);
  const reciter = draft?.reciter ?? chosenReciter;
  const sel = draft?.sel ?? chosenSel;

  const [own, setOwn] = useState(false);
  const [lefty, setLefty] = useState(false);
  useEffect(() => setLefty(readLefty()), []);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [result, setResult] = useState<SavedResult | null>(null);

  const range = sel ? pageRangeOf(sel.kind, sel.ns) : null;
  const shownPage = pages[0]?.page ?? null;
  const pageReady = !!range && shownPage !== null && shownPage >= range.first && shownPage <= range.last;
  const goPage = useCallback((p: number) => {
    router.push(`${basePath}&page=${p}`, { scroll: false });
  }, [basePath, router]);

  // A restored draft on a page outside its portion (an old link, say) opens at its first page.
  const pushed = useRef<number | null>(null);
  useEffect(() => {
    if (!draft || !range || pageReady || pushed.current === range.first) return;
    pushed.current = range.first;
    goPage(range.first);
  }, [draft, range, pageReady, goPage]);

  const begin = (r: Reciter, x: Selection) => {
    setResult(null);
    void s.begin(r, x);
    const first = pageRangeOf(x.kind, x.ns).first;
    pushed.current = first;
    goPage(first);
  };

  const onPick = (p: { reciter: Reciter } | { sel: Selection }) => {
    const r = "reciter" in p ? p.reciter : reciter;
    const x = "sel" in p ? p.sel : sel;
    setChosenReciter(r);
    setChosenSel(x);
    if (r && x) begin(r, x);
  };

  const phase = draft ? clockPhase(draft.clock) : "idle";
  const finished = phase === "finished";
  const started = phase !== "idle";
  const dirty = !!draft && isDirty(draft.clock, draft.marks, draft.checkpoints);

  const rows = useMemo(() => (draft ? checkpointRows({
    kind: draft.sel.kind, ns: draft.sel.ns, checkpoints: draft.checkpoints,
    markAts: draft.marks.map((m) => m.atMs), nowMs: s.elapsed, started, minutes: draft.minutes,
  }) : []), [draft, s.elapsed, started]);

  const ranges = useMemo(() => (sel ? rangesOf(sel.kind, sel.ns) : []), [sel]);
  const heat = useMemo(() => dimHeat(pages, ranges), [pages, ranges]);
  const marks = useMemo(() => markMap(draft?.marks ?? []), [draft?.marks]);
  const last = draft ? latestMark(draft.marks) : null;

  const tickNext = useCallback(() => {
    const cp = s.tickNext();
    if (cp?.nextPage && !own && range && cp.nextPage <= range.last && cp.nextPage !== shownPage) goPage(cp.nextPage);
  }, [s, own, range, shownPage, goPage]);

  const onWordTap = (w: QuranWord) => {
    if (!draft || finished || !inRanges(ranges, w.surah, w.ayah)) return;
    s.toggleWord(locationOf(w));
  };

  // A Space that clicks the focused +1 button would count twice.
  const lastKeyPlus = useRef(0);
  const plus = (fromKeyboardClick: boolean) => {
    if (fromKeyboardClick && Date.now() - lastKeyPlus.current < 400) return;
    s.plus();
  };

  // Keyboard: Space/M +1, Z undo, P start/pause, N tick next, C add checkpoint, arrows turn pages.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e: KeyboardEvent) => {
    if (!draft || finished || pickerOpen) return;
    if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
    const k = shortcutOf(e.key);
    if (!k) return;
    e.preventDefault();
    if (k === "plus") {
      if (!e.repeat) {
        lastKeyPlus.current = Date.now();
        s.plus();
      }
      return;
    }
    if (e.repeat) return;
    if (k === "undo") s.undo();
    else if (k === "startPause") s.startPause();
    else if (k === "tick") tickNext();
    else if (k === "addCheckpoint") s.addCheckpoint();
    else if (!own && range && shownPage !== null) {
      const to = k === "nextPage" ? shownPage + 1 : shownPage - 1;
      if (to >= range.first && to <= range.last) goPage(to);
    }
  };
  useEffect(() => {
    const down = (e: KeyboardEvent) => keys.current(e);
    // Space on a focused button clicks it on keyup; the keydown already counted.
    const up = (e: KeyboardEvent) => {
      if (e.key === " " && !isTyping(e.target) && !e.ctrlKey && !e.metaKey && !e.altKey) e.preventDefault();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // The phone bar is fixed; a spacer of its measured height keeps the page clear of it.
  const controlsWrap = useRef<HTMLDivElement>(null);
  const [dockH, setDockH] = useState(0);
  useEffect(() => {
    const el = controlsWrap.current?.firstElementChild as HTMLElement | null;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setDockH(getComputedStyle(el).position === "fixed" ? el.offsetHeight : 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, [finished]);

  const save = async (types: Parameters<typeof s.save>[0], note: string) => {
    const r = await s.save(types, note);
    if (!r) return;
    setResult(r);
    setChosenReciter(null);
    window.scrollTo?.({ top: 0 });
  };
  const discard = async () => {
    if (await s.discard()) setChosenReciter(null);
  };

  const band = draft && started ? bandOf(s.elapsed, draft.hizbEq, draft.minutes) : null;

  let work: React.ReactNode;
  if (!draft || !sel) {
    work = (
      <div className="grid min-h-[260px] place-items-center rounded-xl border border-dashed border-line bg-card/60 p-6 text-center">
        <p className="max-w-sm text-sm text-muted-foreground">
          {people.length
            ? !reciter
              ? "Choose who is reciting, then the portion, from the title line."
              : "Now choose the portion they're reciting."
            : "No one else is in your class yet."}
        </p>
      </div>
    );
  } else if (own) {
    work = (
      <div className="flex min-h-[300px] flex-col items-start justify-center gap-3 rounded-xl border border-line bg-card p-6">
        <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted-foreground">
          Following {draft.reciter.name} in your own mushaf
        </span>
        <div
          role="timer"
          aria-label="Elapsed time, large"
          className={cn("rounded-xl px-4 py-2.5 text-5xl font-bold tabular-nums md:text-6xl", band ? BAND_TONE[band].pill : "bg-muted text-foreground")}
        >
          {formatClock(s.elapsed)}
        </div>
        <div className="text-sm">
          <b>{band ? `${BAND_LABEL[band]}${phase === "paused" ? " · paused" : ""}` : "Not started"}</b>
          <span className="ml-2 text-muted-foreground">{idealLine(draft.sel, draft.minutes)} for {draft.label}</span>
        </div>
        <p className="max-w-[34em] text-sm text-muted-foreground">
          {!started ? "Press Start when the reciter begins." : timeHint(s.elapsed, draft.hizbEq, draft.minutes)}
          {started && rows.find((r) => r.state === "next") && (
            <> · Now in {rows.find((r) => r.state === "next")!.label}</>
          )}
        </p>
        <p className="text-sm">
          Mistakes <b className="text-xl tabular-nums">{draft.marks.length}</b> · target {limitLine(draft.limit)}
        </p>
        <Button variant="outline" onClick={() => setOwn(false)}>Show the app mushaf</Button>
      </div>
    );
  } else {
    work = (
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
          {range && shownPage !== null && (
            <span>
              <strong className="text-foreground">Page {shownPage}</strong> of {range.first}–{range.last}
            </span>
          )}
          <button type="button" onClick={() => setOwn(true)} className="h-8 rounded-md px-1.5 font-semibold text-brand hover:underline">
            My own mushaf
          </button>
        </div>
        {pageReady ? (
          <div className="mushaf-bleed">
            <MushafPager page={shownPage!} min={range!.first} max={range!.last} basePath={basePath}>
              <MushafReader
                pages={pages}
                marks={marks}
                heat={heat}
                surahNames={surahNames}
                onWordTap={finished ? undefined : onWordTap}
              />
            </MushafPager>
          </div>
        ) : (
          <p className="py-16 text-center text-sm text-muted-foreground" role="status">Opening the mushaf at page {range?.first}…</p>
        )}
      </div>
    );
  }

  return (
    <section className="space-y-4" aria-label="Murāja'ah">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <TitleLine
          people={people}
          reciter={reciter}
          sel={sel}
          dirty={dirty}
          minutes={draft?.minutes ?? target.minutes}
          onPick={onPick}
          onOpenChange={setPickerOpen}
        />
        <Button
          variant="outline"
          aria-pressed={lefty}
          onClick={() => { setLefty(!lefty); writeLefty(!lefty); }}
          title="Move the controls to the other side"
          className={cn(lefty && "border-brand bg-muted")}
        >
          Left-handed
        </Button>
      </div>
      {draft && (
        <p className="text-[12.5px] text-muted-foreground md:hidden">
          Target: <b className="text-foreground">{limitLine(draft.limit)}</b> · set by {teacherName}
        </p>
      )}

      {result && (
        <p role="status" className="rounded-lg bg-ok/15 px-3 py-2 text-sm text-ok">
          Saved: {result.reciter} · {result.label} · {formatClock(result.totalMs)}{" "}
          {BAND_LABEL[bandOf(result.totalMs, result.hizbEq, result.minutes)]} · {result.mistakes} mistake{result.mistakes === 1 ? "" : "s"},{" "}
          {result.mistakes <= result.limit ? "target met" : "target missed"}. Choose who&apos;s next.
        </p>
      )}
      {s.error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-danger/15 px-3 py-2 text-sm text-danger">
          <span>{s.error}</span>
          <span className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => window.location.reload()}>Reload</Button>
            <Button size="sm" variant="ghost" onClick={s.clearError}>Dismiss</Button>
          </span>
        </div>
      )}

      {draft && finished ? (
        <FinishSummary
          key={draft.id ?? "draft"}
          draft={draft}
          teacherName={teacherName}
          saving={s.saving}
          onSave={save}
          onDiscard={discard}
        />
      ) : (
        <>
          <div
            className={cn(
              "md:grid md:gap-4",
              lefty
                ? "md:grid-cols-[clamp(260px,28vw,300px)_minmax(0,1fr)]"
                : "md:grid-cols-[minmax(0,1fr)_clamp(260px,28vw,300px)]",
            )}
          >
            <div className={cn("min-w-0", lefty && "md:order-2")}>{work}</div>
            <div ref={controlsWrap} className={cn("min-w-0", lefty && "md:order-1")}>
              <SessionControls
                ready={!!draft}
                clock={draft?.clock ?? { elapsed_ms: 0, running_since: null, timer_started_at: null, finished_at: null }}
                elapsed={s.elapsed}
                sel={sel}
                hizbEq={draft?.hizbEq ?? 1}
                minutes={draft?.minutes ?? target.minutes}
                limit={draft?.limit ?? null}
                teacherName={teacherName}
                rows={rows}
                mistakes={draft?.marks.length ?? 0}
                lastMarkLabel={last ? (last.surah === null ? "+1" : markPlace(last)) : null}
                lefty={lefty}
                onStartPause={s.startPause}
                onFinish={s.finish}
                onTick={tickNext}
                onUntick={s.untick}
                onAddCheckpoint={s.addCheckpoint}
                onUndo={s.undo}
                onPlus={plus}
              />
            </div>
          </div>
          <div aria-hidden className="md:hidden" style={{ height: dockH }} />
        </>
      )}
      <p className="sr-only" aria-live="polite">
        {draft ? `${draft.marks.length} mistake${draft.marks.length === 1 ? "" : "s"}` : ""}
      </p>
    </section>
  );
}
