/**
 * The murāja'ah clock. Pure and client-safe.
 *
 * The server owns it: every Start, Pause, Resume and Finish is a call to
 * `public.murajaah_clock()` (0144), which uses the database's now(). Live
 * time is `elapsed_ms + (now − running_since)` while running; Pause folds the
 * running span into elapsed_ms and clears running_since.
 *
 * The client only DISPLAYS it. `clockSkew` from the RPC's `server_now`
 * corrects for a device clock that is off; `applyClockOp` mirrors the SQL so a
 * button can update at once while the call is in flight.
 */

export type ClockFields = {
  elapsed_ms: number;
  running_since: string | null;
  timer_started_at: string | null;
  finished_at: string | null;
};

/** What `murajaah_clock()` returns: the fields plus the server's now(). */
export type ClockSnapshot = ClockFields & { server_now: string };

export type ClockOp = "start" | "pause" | "resume" | "finish";
export const CLOCK_OPS: readonly ClockOp[] = ["start", "pause", "resume", "finish"];

export type ClockPhase = "idle" | "running" | "paused" | "finished";

export const NEW_CLOCK: ClockFields = {
  elapsed_ms: 0, running_since: null, timer_started_at: null, finished_at: null,
};

export function clockPhase(c: ClockFields): ClockPhase {
  if (c.finished_at) return "finished";
  if (c.running_since) return "running";
  return c.timer_started_at ? "paused" : "idle";
}

const toMs = (t: number | Date) => (typeof t === "number" ? t : t.getTime());

/**
 * Elapsed ms on the session clock at `now` (client time). `skewMs` is
 * server − client (see `clockSkew`), so `now + skewMs` is the server's time.
 */
export function elapsedAt(c: ClockFields, now: number | Date, skewMs = 0): number {
  if (!c.running_since) return c.elapsed_ms;
  const span = toMs(now) + skewMs - Date.parse(c.running_since);
  return c.elapsed_ms + Math.max(0, Math.floor(span));
}

/** server − client, from a snapshot's `server_now` and the client time it arrived. */
export function clockSkew(serverNow: string, receivedAt: number): number {
  return Date.parse(serverNow) - receivedAt;
}

/**
 * The same transition `murajaah_clock()` makes, at time `at` (ms). Throws
 * the same refusals: resume/finish before the first Start, anything after
 * Finish. A repeated op returns the clock unchanged.
 */
export function applyClockOp(c: ClockFields, op: ClockOp, at: number): ClockFields {
  if (c.finished_at) throw new Error("This session is finished.");
  const iso = new Date(at).toISOString();
  const span = c.running_since ? Math.max(0, Math.floor(at - Date.parse(c.running_since))) : 0;

  if (op === "start" || op === "resume") {
    if (op === "resume" && !c.timer_started_at) throw new Error("The clock has not started.");
    if (c.running_since) return c;
    return { ...c, running_since: iso, timer_started_at: c.timer_started_at ?? iso };
  }
  if (op === "pause") {
    if (!c.running_since) return c;
    return { ...c, elapsed_ms: c.elapsed_ms + span, running_since: null };
  }
  if (!c.timer_started_at) throw new Error("The clock has not started.");
  return { ...c, elapsed_ms: c.elapsed_ms + span, running_since: null, finished_at: iso };
}
