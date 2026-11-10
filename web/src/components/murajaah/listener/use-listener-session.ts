"use client";

/**
 * The listener's live session: its clock, marks and checkpoints, held on the
 * client and written to the server one action at a time.
 *
 * - Every change shows at once (an optimistic update), then its server
 *   action runs. Actions run strictly in order through one queue, so an Undo
 *   tapped while its mark is still saving removes the right row: a new mark
 *   or checkpoint carries a temporary id until the server answers, and each
 *   queued call resolves ids when it runs, not when it was tapped.
 * - The clock is the server's. Each clock action applies `applyClockOp` for
 *   instant feedback, then takes the server's snapshot and its skew. Only the
 *   latest clock action's snapshot is applied, so quick taps don't flicker.
 * - In-session actions revalidate nothing; this state is the screen's truth
 *   until a reload, when `myDraft()` restores it.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  addMark, discardDraft, finishClock, pauseClock, removeMark, resumeClock, setMarkTypes,
  startClock, startDraft, submitSession, tickCheckpoint, untickCheckpoint,
} from "@/lib/murajaah/actions";
import type { BandMinutes } from "@/lib/murajaah/bands";
import { ADDED_ORD_BASE, autoCheckpoints, nextAddedOrd, nextAutoOrd } from "@/lib/murajaah/checkpoints";
import {
  applyClockOp, clockPhase, clockSkew, elapsedAt, NEW_CLOCK,
  type ClockFields, type ClockOp, type ClockSnapshot,
} from "@/lib/murajaah/clock";
import { hizbEqOf, selectionLabel } from "@/lib/murajaah/portions";
import type { CheckpointView, MarkCategory, MarkLocation, MarkView, SessionView } from "@/lib/murajaah/sessions";
import { latestMark, markAt, type Selection } from "./listener-logic";

export type Reciter = { id: string; name: string };

export type Draft = {
  /** Null until startDraft answers. */
  id: string | null;
  reciter: Reciter;
  sel: Selection;
  label: string;
  hizbEq: number;
  limit: number;
  minutes: BandMinutes;
  clock: ClockFields;
  /** server − client, in ms. */
  skew: number;
  /** In the order they were added; Undo takes the last. */
  marks: MarkView[];
  checkpoints: CheckpointView[];
};

export type SavedResult = {
  reciter: string; label: string; totalMs: number; hizbEq: number; minutes: BandMinutes;
  mistakes: number; limit: number;
};

const message = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong.");

function fromView(v: SessionView, skew: number): Draft {
  return {
    id: v.id,
    reciter: { id: v.reciterId, name: v.reciterName },
    sel: { kind: v.kind, ns: v.ns },
    label: v.label, hizbEq: v.hizbEq, limit: v.mistakeLimit, minutes: v.minutes,
    clock: v.clock, skew,
    marks: v.marks, checkpoints: v.checkpoints,
  };
}

/** Ignore an untick this soon after a tick: the second half of a double tap. */
const UNTICK_GUARD_MS = 650;

export function useListenerSession({
  initial, serverNow, limitFor, minutes,
}: {
  initial: SessionView | null;
  /** The server's time when it rendered `initial`, for the clock's skew. */
  serverNow: string;
  /** The mistake limit a new draft will snapshot, for the reciter and portion. */
  limitFor: (reciterId: string, sel: Selection) => number;
  /** The class's band minutes, for a new draft. */
  minutes: BandMinutes;
}) {
  const [draft, setDraftState] = useState<Draft | null>(() =>
    initial ? fromView(initial, clockSkew(serverNow, Date.now())) : null,
  );
  const ref = useRef(draft);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const realIds = useRef(new Map<string, string>());
  const seq = useRef(0);
  const clockSeq = useRef(0);
  const lastTick = useRef(0);

  const put = useCallback((next: Draft | null) => {
    ref.current = next;
    setDraftState(next);
  }, []);
  const update = useCallback((f: (d: Draft) => Draft) => {
    if (ref.current) put(f(ref.current));
  }, [put]);

  /** Run after everything queued before it. True when it succeeded. */
  const run = useCallback((fn: () => Promise<void>): Promise<boolean> => {
    const p = queue.current.then(fn).then(
      () => true,
      (e) => {
        setError(message(e));
        return false;
      },
    );
    queue.current = p;
    return p;
  }, []);

  const real = (id: string) => realIds.current.get(id) ?? id;
  const sid = () => {
    const id = ref.current?.id;
    if (!id) throw new Error("This session didn't start. Pick the portion again.");
    return id;
  };
  const tempId = () => `tmp-${++seq.current}`;

  // The display ticks while the clock runs.
  const running = !!draft?.clock.running_since;
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [running]);

  const elapsedNow = () => {
    const d = ref.current;
    return d ? Math.max(0, Math.floor(elapsedAt(d.clock, Date.now(), d.skew))) : 0;
  };

  /** Open a draft (also "Start over"): startDraft replaces any draft of this listener. */
  const begin = useCallback((reciter: Reciter, sel: Selection): Promise<boolean> => {
    put({
      id: null, reciter, sel,
      label: selectionLabel(sel.kind, sel.ns), hizbEq: hizbEqOf(sel.kind, sel.ns),
      limit: limitFor(reciter.id, sel), minutes,
      clock: NEW_CLOCK, skew: ref.current?.skew ?? 0, marks: [], checkpoints: [],
    });
    setError(null);
    return run(async () => {
      const id = await startDraft(reciter.id, sel.kind, sel.ns);
      update((d) => (d.reciter.id === reciter.id ? { ...d, id } : d));
    });
  }, [limitFor, minutes, put, run, update]);

  const clockOp = useCallback((op: ClockOp) => {
    const d = ref.current;
    if (!d) return;
    try {
      update((x) => ({ ...x, clock: applyClockOp(x.clock, op, Date.now() + x.skew) }));
    } catch {
      return; // a refused op (e.g. after Finish) does nothing
    }
    const mine = ++clockSeq.current;
    const call = { start: startClock, pause: pauseClock, resume: resumeClock, finish: finishClock }[op];
    void run(async () => {
      const snap: ClockSnapshot = await call(sid());
      if (mine !== clockSeq.current) return;
      const { server_now, ...clock } = snap;
      update((x) => ({ ...x, clock, skew: clockSkew(server_now, Date.now()) }));
    });
  }, [run, update]);

  const startPause = useCallback(() => {
    const d = ref.current;
    if (!d) return;
    const phase = clockPhase(d.clock);
    if (phase === "idle") clockOp("start");
    else if (phase === "running") clockOp("pause");
    else if (phase === "paused") clockOp("resume");
  }, [clockOp]);

  const finish = useCallback(() => {
    const d = ref.current;
    if (d && d.clock.timer_started_at && !d.clock.finished_at) clockOp("finish");
  }, [clockOp]);

  const canMark = () => !!ref.current && !ref.current.clock.finished_at;

  const addOne = useCallback((loc: MarkLocation | null) => {
    if (!canMark()) return;
    const id = tempId();
    const atMs = elapsedNow();
    update((d) => ({
      ...d,
      marks: [...d.marks, { id, atMs, surah: loc?.surah ?? null, ayah: loc?.ayah ?? null, position: loc?.position ?? null, category: null }],
    }));
    void run(async () => {
      realIds.current.set(id, await addMark(sid(), atMs, loc));
    });
  }, [run, update]);

  const dropMark = useCallback((id: string) => {
    update((d) => ({ ...d, marks: d.marks.filter((m) => m.id !== id) }));
    void run(async () => {
      await removeMark(real(id));
    });
  }, [run, update]);

  const plus = useCallback(() => addOne(null), [addOne]);

  /** A word tap: mark it, or remove the mark already on it. */
  const toggleWord = useCallback((loc: MarkLocation) => {
    if (!canMark()) return;
    const existing = markAt(ref.current!.marks, loc);
    if (existing) dropMark(existing.id);
    else addOne(loc);
  }, [addOne, dropMark]);

  const undo = useCallback(() => {
    if (!canMark()) return;
    const last = latestMark(ref.current!.marks);
    if (last) dropMark(last.id);
  }, [dropMark]);

  const canTick = () => {
    const d = ref.current;
    return !!d && !!d.clock.timer_started_at && !d.clock.finished_at;
  };

  /** Tick the next automatic checkpoint. Returns it, for the page turn. */
  const tickNext = useCallback(() => {
    if (!canTick()) return null;
    const d = ref.current!;
    const autos = autoCheckpoints(d.sel.kind, d.sel.ns);
    const ord = nextAutoOrd(autos.length, d.checkpoints.map((c) => c.ord));
    if (ord === null) return null;
    const auto = autos[ord - 1];
    const id = tempId();
    const atMs = elapsedNow();
    lastTick.current = Date.now();
    update((x) => ({ ...x, checkpoints: [...x.checkpoints, { id, kind: "auto", ord, label: auto.label, atMs }] }));
    void run(async () => {
      realIds.current.set(id, await tickCheckpoint(sid(), "auto", ord, auto.label, atMs));
    });
    return auto;
  }, [run, update]);

  const addCheckpoint = useCallback(() => {
    if (!canTick()) return;
    const d = ref.current!;
    const ord = nextAddedOrd(d.checkpoints.map((c) => c.ord));
    const id = tempId();
    const atMs = elapsedNow();
    lastTick.current = Date.now();
    update((x) => ({
      ...x,
      checkpoints: [...x.checkpoints, { id, kind: "added", ord, label: `Checkpoint ${ord - ADDED_ORD_BASE}`, atMs }],
    }));
    void run(async () => {
      realIds.current.set(id, await tickCheckpoint(sid(), "added", 0, "", atMs));
    });
  }, [run, update]);

  const untick = useCallback((id: string) => {
    if (!canTick() || Date.now() - lastTick.current < UNTICK_GUARD_MS) return;
    const d = ref.current!;
    const cp = d.checkpoints.find((c) => c.id === id);
    if (!cp) return;
    if (cp.kind === "auto" && d.checkpoints.some((c) => c.kind === "auto" && c.ord > cp.ord)) return;
    update((x) => ({ ...x, checkpoints: x.checkpoints.filter((c) => c.id !== id) }));
    void run(async () => {
      await untickCheckpoint(real(id));
    });
  }, [run, update]);

  /** Save: the types first, then the session. Resolves to the result, or null on failure. */
  const save = useCallback(async (types: Record<string, MarkCategory | null>, note: string): Promise<SavedResult | null> => {
    const d = ref.current;
    if (!d) return null;
    setSaving(true);
    const ok = await run(async () => {
      const id = sid();
      const changed = d.marks
        .filter((m) => (types[m.id] ?? null) !== m.category)
        .map((m) => ({ markId: real(m.id), category: types[m.id] ?? null }));
      await setMarkTypes(id, changed);
      await submitSession(id, note);
    });
    setSaving(false);
    if (!ok) return null;
    const result: SavedResult = {
      reciter: d.reciter.name, label: d.label, totalMs: d.clock.elapsed_ms, hizbEq: d.hizbEq,
      minutes: d.minutes, mistakes: d.marks.length, limit: d.limit,
    };
    put(null);
    return result;
  }, [put, run]);

  const discard = useCallback(async (): Promise<boolean> => {
    if (!ref.current) return true;
    setSaving(true);
    const ok = await run(async () => {
      const id = ref.current?.id;
      if (id) await discardDraft(id);
    });
    setSaving(false);
    if (ok) put(null);
    return ok;
  }, [put, run]);

  const elapsed = draft ? Math.max(0, Math.floor(elapsedAt(draft.clock, now, draft.skew))) : 0;

  return {
    draft, elapsed, error, saving,
    clearError: () => setError(null),
    begin, startPause, finish, plus, toggleWord, undo, tickNext, addCheckpoint, untick, save, discard,
  };
}

export type ListenerSession = ReturnType<typeof useListenerSession>;
