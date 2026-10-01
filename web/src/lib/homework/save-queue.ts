/**
 * Debounced autosave for the homework form, one timer per question.
 *
 * Kept out of the component so the hand-in can wait on it. The bug it exists
 * for: the last answer sat in its 600 ms timer while Submit ran, the server
 * (which runs actions one at a time) handed the work in first, and the save
 * that followed found a non-draft and was dropped, under a "Draft saved".
 * `flush()` sends whatever is waiting, waits for everything in flight, and
 * rejects if any answer is still unsaved, so the hand-in only goes after.
 */
export type SaveStatus = {
  /** Saves sent and not yet answered. */
  inFlight: number;
  /** Answers changed but not yet sent. */
  queued: number;
  /** A failure still standing: cleared once that answer saves. */
  error: string | null;
};

export function createSaveQueue<T>({
  save,
  delayMs = 600,
  onStatus,
}: {
  /** Rejects when the answer did not land. */
  save: (key: string, value: T) => Promise<void>;
  delayMs?: number;
  onStatus?: (status: SaveStatus) => void;
}) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Latest value per key not yet known to be saved, with its version. */
  const unsaved = new Map<string, { value: T; version: number }>();
  const inFlight = new Set<Promise<void>>();
  /** Each answer's standing failure, so one answer saving clears only its own. */
  const errors = new Map<string, string>();
  let version = 0;

  const firstError = () => errors.values().next().value ?? null;
  const report = () =>
    onStatus?.({ inFlight: inFlight.size, queued: timers.size, error: firstError() });

  function send(key: string) {
    timers.delete(key);
    const entry = unsaved.get(key);
    if (!entry) return;
    const p = save(key, entry.value).then(
      () => {
        // Only the newest value clears the key: an older save landing late
        // must not mark a newer, still-unsent answer as saved.
        if (unsaved.get(key)?.version === entry.version) unsaved.delete(key);
        errors.delete(key);
      },
      (e: unknown) => {
        errors.set(key, e instanceof Error ? e.message : "Your answer could not be saved.");
      },
    );
    inFlight.add(p);
    report();
    void p.finally(() => {
      inFlight.delete(p);
      report();
    });
  }

  return {
    schedule(key: string, value: T) {
      unsaved.set(key, { value, version: ++version });
      clearTimeout(timers.get(key));
      timers.set(key, setTimeout(() => send(key), delayMs));
      report();
    },

    /** Send everything now, retrying earlier failures, and wait for it all. */
    async flush(): Promise<void> {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      // Let what is already on its way land first, then send everything still
      // unsaved — including an answer whose earlier save failed, which would
      // otherwise go missing from the hand-in.
      await Promise.allSettled([...inFlight]);
      for (const key of [...unsaved.keys()]) send(key);
      await Promise.allSettled([...inFlight]);
      if (unsaved.size > 0) {
        throw new Error(firstError() ?? "Some answers could not be saved. Try again.");
      }
    },

    /** Stop pending timers (unmount). Nothing in flight is cancelled. */
    cancel() {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    },
  };
}
