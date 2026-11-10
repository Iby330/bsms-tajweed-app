/**
 * The shapes the murāja'ah screens read. Pure and client-safe: `queries.ts`
 * (server) builds these, and both UIs import only the types and helpers here.
 */
import type { Database } from "@/lib/database.types";
import { bandOf, DEFAULT_BAND_MINUTES, type Band, type BandMinutes } from "./bands";
import type { ClockFields } from "./clock";
import type { PortionKind } from "./portions";

/** The stored mistake types: lib/hifz/mistake-taxonomy's CATEGORY ids, plus the retired "fluency". */
export type MarkCategory = "hifz" | "tajweed" | "makhraj" | "fluency";
export const MARK_CATEGORIES: readonly MarkCategory[] = ["hifz", "tajweed", "makhraj", "fluency"];

/** Where a tapped mistake sits. `position: null` = the whole ayah (its end marker). */
export type MarkLocation = { surah: number; ayah: number; position: number | null };

export type MarkView = {
  id: string;
  atMs: number;
  /** All three null = a "Mistake +1" counter mark. */
  surah: number | null;
  ayah: number | null;
  position: number | null;
  category: MarkCategory | null;
};

export type CheckpointView = { id: string; kind: "auto" | "added"; ord: number; label: string; atMs: number };

export type SessionView = {
  id: string;
  classId: string;
  listenerId: string;
  listenerName: string;
  reciterId: string;
  reciterName: string;
  kind: PortionKind;
  ns: number[];
  label: string;
  hizbEq: number;
  /** The limit snapshotted at the start. */
  mistakeLimit: number;
  /** The band minutes snapshotted at the start. */
  minutes: BandMinutes;
  createdAt: string;
  clock: ClockFields;
  submittedAt: string | null;
  note: string | null;
  /** In time order. */
  marks: MarkView[];
  /** In time order. */
  checkpoints: CheckpointView[];
  /** = marks.length: counter marks plus word/ayah marks. */
  mistakes: number;
};

type Tables = Database["public"]["Tables"];
export type SessionRowLike = Omit<Tables["murajaah_sessions"]["Row"], "band_minutes"> & { band_minutes: unknown };
export type MarkRowLike = Pick<Tables["murajaah_marks"]["Row"],
  "id" | "session_id" | "at_ms" | "surah_number" | "ayah_number" | "word_position" | "category">;
export type CheckpointRowLike = Pick<Tables["murajaah_checkpoints"]["Row"],
  "id" | "session_id" | "kind" | "ord" | "label" | "at_ms">;

/** The column lists `queries.ts` selects, so the row shapes above hold. */
export const SESSION_COLS =
  "id, class_id, listener_id, reciter_id, portion_kind, portion_ns, portion_label, hizb_eq, mistake_limit, band_minutes, created_at, timer_started_at, running_since, elapsed_ms, finished_at, submitted_at, note";
export const MARK_COLS = "id, session_id, at_ms, surah_number, ayah_number, word_position, category";
export const CHECKPOINT_COLS = "id, session_id, kind, ord, label, at_ms";

function minutesOf(x: unknown): BandMinutes {
  const m = x as Partial<BandMinutes> | null;
  if (!m || typeof m !== "object") return { ...DEFAULT_BAND_MINUTES };
  const n = (v: unknown, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
  return {
    ideal: n(m.ideal, DEFAULT_BAND_MINUTES.ideal),
    good: n(m.good, DEFAULT_BAND_MINUTES.good),
    acceptable: n(m.acceptable, DEFAULT_BAND_MINUTES.acceptable),
  };
}

export function toSessionView(
  row: SessionRowLike,
  marks: readonly MarkRowLike[],
  checkpoints: readonly CheckpointRowLike[],
  names: ReadonlyMap<string, string>,
): SessionView {
  const ms = marks
    .filter((m) => m.session_id === row.id)
    .map((m): MarkView => ({
      id: m.id, atMs: m.at_ms, surah: m.surah_number, ayah: m.ayah_number,
      position: m.word_position, category: (m.category as MarkCategory | null) ?? null,
    }))
    .sort((a, b) => a.atMs - b.atMs);
  const cps = checkpoints
    .filter((c) => c.session_id === row.id)
    .map((c): CheckpointView => ({ id: c.id, kind: c.kind as "auto" | "added", ord: c.ord, label: c.label, atMs: c.at_ms }))
    .sort((a, b) => a.atMs - b.atMs || a.ord - b.ord);
  return {
    id: row.id,
    classId: row.class_id,
    listenerId: row.listener_id,
    listenerName: names.get(row.listener_id) ?? "Classmate",
    reciterId: row.reciter_id,
    reciterName: names.get(row.reciter_id) ?? "Classmate",
    kind: row.portion_kind as PortionKind,
    ns: row.portion_ns,
    label: row.portion_label,
    hizbEq: Number(row.hizb_eq),
    mistakeLimit: row.mistake_limit,
    minutes: minutesOf(row.band_minutes),
    createdAt: row.created_at,
    clock: {
      elapsed_ms: row.elapsed_ms, running_since: row.running_since,
      timer_started_at: row.timer_started_at, finished_at: row.finished_at,
    },
    submittedAt: row.submitted_at,
    note: row.note,
    marks: ms,
    checkpoints: cps,
    mistakes: ms.length,
  };
}

export type SessionOutcome = { totalMs: number; band: Band; mistakes: number; limit: number; withinLimit: boolean };

/**
 * A saved session as it was judged at the time: its total time banded on
 * its snapshot minutes, and its mistakes against its snapshot limit. The
 * limit is inclusive: N mistakes on a limit of N is met.
 */
export function sessionOutcome(s: SessionView): SessionOutcome {
  const totalMs = s.clock.elapsed_ms;
  return {
    totalMs,
    band: bandOf(totalMs, s.hizbEq, s.minutes),
    mistakes: s.mistakes,
    limit: s.mistakeLimit,
    withinLimit: s.mistakes <= s.mistakeLimit,
  };
}
