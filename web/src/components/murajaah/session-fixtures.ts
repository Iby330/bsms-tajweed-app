/**
 * Test-only builders for SessionView, shared by the murāja'ah component tests.
 * Not imported by app code.
 */
import { DEFAULT_BAND_MINUTES } from "@/lib/murajaah/bands";
import type { MarkView, SessionView } from "@/lib/murajaah/sessions";

export const MIN = 60_000;

let seq = 0;

/** A saved session. `at` is an ISO date or "YYYY-MM-DD" (18:00 UTC). */
export function session(over: Partial<SessionView> & { at?: string } = {}): SessionView {
  seq += 1;
  const { at: atIn, ...rest } = over;
  const at = !atIn ? "2026-11-04T18:00:00.000Z" : atIn.length === 10 ? `${atIn}T18:00:00.000Z` : atIn;
  const marks = rest.marks ?? [];
  const base: SessionView = {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    classId: "c1",
    listenerId: "l1",
    listenerName: "Yunus Zafar",
    reciterId: "r1",
    reciterName: "Abdallah Ghouse",
    kind: "juz",
    ns: [30],
    label: "Juz 30",
    hizbEq: 2,
    mistakeLimit: 5,
    minutes: { ...DEFAULT_BAND_MINUTES },
    createdAt: at,
    clock: { elapsed_ms: 18 * MIN, running_since: null, timer_started_at: at, finished_at: at },
    submittedAt: at,
    note: null,
    marks,
    checkpoints: [],
    mistakes: marks.length,
  };
  const out = { ...base, ...rest };
  if (!rest.marks && rest.mistakes != null) out.marks = counterMarks(rest.mistakes);
  out.mistakes = out.marks.length;
  return out;
}

/** n "Mistake +1" marks at 1s, 2s, … */
export function counterMarks(n: number, category: MarkView["category"] = null): MarkView[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `m${seq}-${i}`, atMs: (i + 1) * 1000, surah: null, ayah: null, position: null, category,
  }));
}

/** A session timed at `ms`. */
export const timed = (ms: number, over: Partial<SessionView> & { at?: string } = {}) =>
  session({ ...over, clock: { elapsed_ms: ms, running_since: null, timer_started_at: null, finished_at: null } });
