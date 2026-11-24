"use client";

/**
 * Keeps an open paper in step with other teachers on it (0155). Every 10 s
 * while the tab is visible, and at once when the teacher comes back to the
 * tab, it asks the server who else is here and when the paper last changed.
 * When the change was someone else's (or someone else is here, so it may
 * have been), `onStale` is called; the workspace reloads the paper when the
 * teacher is not mid-edit. `markSeen` moves the baseline once a reload has
 * been swapped in, so the same change is not fetched twice.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { leavePaper, pulsePaper } from "@/lib/exam-builder/live-actions";

const EVERY_MS = 10_000;

export type Others = { id: string; name: string }[];

export function usePaperPulse({
  paperId,
  meId,
  updatedAt,
  onStale,
}: {
  paperId: string;
  meId: string;
  /** The paper's updated_at as the screen has it now. */
  updatedAt: string;
  onStale: () => void;
}) {
  const [others, setOthers] = useState<Others>([]);
  const [gone, setGone] = useState(false);
  const seen = useRef(updatedAt);
  const hadOthers = useRef(false);
  const stale = useRef(onStale);
  useEffect(() => {
    stale.current = onStale;
  }, [onStale]);

  const markSeen = useCallback((at: string) => {
    seen.current = at;
  }, []);

  useEffect(() => {
    let alive = true;
    let busy = false;
    const tick = async () => {
      if (busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const res = await pulsePaper(paperId);
        if (!alive || !res.ok) return;
        const p = res.pulse;
        if (p.gone) {
          setGone(true);
          setOthers([]);
          return;
        }
        setGone(false);
        setOthers((prev) =>
          prev.length === p.others.length && prev.every((o, i) => o.id === p.others[i].id && o.name === p.others[i].name)
            ? prev
            : p.others,
        );
        const someoneElse = p.others.length > 0 || hadOthers.current;
        hadOthers.current = p.others.length > 0;
        if (p.updatedAt !== seen.current && (p.updatedBy !== meId || someoneElse)) {
          stale.current();
        } else if (p.updatedAt !== seen.current) {
          // Only this teacher's own saves since last time: nothing to fetch.
          seen.current = p.updatedAt;
        }
      } catch {
        // Offline for a moment: try again next tick.
      } finally {
        busy = false;
      }
    };
    void tick();
    const timer = setInterval(tick, EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      void leavePaper(paperId).catch(() => {});
    };
  }, [paperId, meId]);

  return { others, gone, markSeen };
}
