/**
 * Pure homework logic — response-shape builders, lateness, countdown
 * bucketing, status chips. No IO: everything here is unit-testable.
 *
 * Response shapes (answers.response jsonb):
 *   mcq / checkbox → {"selected":[positions]}
 *   text / paragraph → {"text":"…"}
 *   grid → {"grid":{"rowLabel":"colLabel"}} — the student RPC exposes no grid
 *   structure (options are null), so the form falls back to a text answer.
 */

export type QType = "mcq" | "checkbox" | "text" | "paragraph" | "grid";
export type SubStatus = "draft" | "submitted" | "auto_marked" | "approved";

export type SelectedResponse = { selected: number[] };
export type TextResponse = { text: string };
export type GridResponse = { grid: Record<string, string> };
export type AnswerResponse = SelectedResponse | TextResponse | GridResponse;

/* ── RPC payload (get_homework_for_student — answer keys stripped) ────── */

export type StudentOption = { position: number; label: string; value?: string };

export type StudentQuestion = {
  id: string;
  position: number;
  qtype: QType;
  prompt: string;
  points: number;
  is_bonus: boolean;
  is_task: boolean;
  options: StudentOption[] | null;
};

export type StudentHomework = {
  homework: {
    id: string;
    number: number;
    title: string;
    series: string;
    total_marks: number;
    due_at: string | null;
    is_graded: boolean;
  };
  questions: StudentQuestion[];
};

/** Validate + normalise the RPC's jsonb payload. Returns null when malformed. */
export function parseStudentHomework(json: unknown): StudentHomework | null {
  if (typeof json !== "object" || json === null) return null;
  const obj = json as Record<string, unknown>;
  const hw = obj.homework as StudentHomework["homework"] | undefined;
  const questions = obj.questions;
  if (!hw || typeof hw.id !== "string" || !Array.isArray(questions)) return null;
  const sorted = [...(questions as StudentQuestion[])]
    .sort((a, b) => a.position - b.position)
    .map((q) => ({
      ...q,
      options: q.options
        ? [...q.options].sort((a, b) => a.position - b.position)
        : null,
    }));
  return { homework: hw, questions: sorted };
}

/* ── Response builders ────────────────────────────────────────────────── */

export function mcqResponse(position: number | null): SelectedResponse {
  return { selected: position === null ? [] : [position] };
}

/** Sorted + deduped so identical answers always serialise identically. */
export function checkboxResponse(positions: number[]): SelectedResponse {
  return { selected: [...new Set(positions)].sort((a, b) => a - b) };
}

export function textResponse(text: string): TextResponse {
  return { text };
}

export function gridResponse(grid: Record<string, string>): GridResponse {
  return { grid };
}

/* ── Reading stored responses back (defensive against bad shapes) ─────── */

export function selectedOf(response: unknown): number[] {
  if (typeof response !== "object" || response === null) return [];
  const sel = (response as SelectedResponse).selected;
  return Array.isArray(sel) ? sel.filter((n) => typeof n === "number") : [];
}

export function textOf(response: unknown): string {
  if (typeof response !== "object" || response === null) return "";
  const t = (response as TextResponse).text;
  return typeof t === "string" ? t : "";
}

export function responseIsEmpty(response: unknown): boolean {
  if (typeof response !== "object" || response === null) return true;
  const r = response as Partial<SelectedResponse & TextResponse & GridResponse>;
  if (Array.isArray(r.selected)) return r.selected.length === 0;
  if (typeof r.text === "string") return r.text.trim() === "";
  if (r.grid && typeof r.grid === "object")
    return Object.keys(r.grid).length === 0;
  return true;
}

/* ── Lateness ─────────────────────────────────────────────────────────── */

/** Strictly past the deadline. No deadline → never late. */
export function isLate(now: Date, dueAt: string | Date | null): boolean {
  if (!dueAt) return false;
  const due = typeof dueAt === "string" ? Date.parse(dueAt) : dueAt.getTime();
  if (Number.isNaN(due)) return false;
  return now.getTime() > due;
}

/* ── Countdown bucketing (CountdownChip) ──────────────────────────────── */

export type CountdownTone = "default" | "warn" | "danger" | "overdue";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MINUTE = 60_000;

/** --warn under 24h, --danger under 6h, overdue at/after the deadline. */
export function countdownTone(msLeft: number): CountdownTone {
  if (msLeft <= 0) return "overdue";
  if (msLeft < 6 * HOUR) return "danger";
  if (msLeft < DAY) return "warn";
  return "default";
}

/** "2d 4h" · "5h 12m" · "23m" · "<1m" · "Overdue". */
export function formatRemaining(msLeft: number): string {
  if (msLeft <= 0) return "Overdue";
  const days = Math.floor(msLeft / DAY);
  const hours = Math.floor((msLeft % DAY) / HOUR);
  const minutes = Math.floor((msLeft % HOUR) / MINUTE);
  if (days >= 1) return `${days}d ${hours}h`;
  if (hours >= 1) return `${hours}h ${minutes}m`;
  if (minutes >= 1) return `${minutes}m`;
  return "<1m";
}

export function countdown(
  now: Date,
  dueAt: string | Date,
): { tone: CountdownTone; label: string } {
  const due = typeof dueAt === "string" ? Date.parse(dueAt) : dueAt.getTime();
  const msLeft = due - now.getTime();
  return { tone: countdownTone(msLeft), label: formatRemaining(msLeft) };
}

/* ── Status chips (homework index) ────────────────────────────────────── */

export type ChipTone = "muted" | "warn" | "ink" | "ok";

/**
 * Student-facing status. `auto_marked` deliberately reads as "Submitted" —
 * marking is invisible to students until the teacher approves.
 */
export function statusChip(status: SubStatus | null | undefined): {
  label: string;
  tone: ChipTone;
} {
  switch (status) {
    case "draft":
      return { label: "Draft", tone: "warn" };
    case "submitted":
    case "auto_marked":
      return { label: "Submitted", tone: "ink" };
    case "approved":
      return { label: "Marked", tone: "ok" };
    default:
      return { label: "Not started", tone: "muted" };
  }
}

/* ── Mark badge tone ──────────────────────────────────────────────────── */

export type MarkTone = "ok" | "warn" | "danger";

/** Full marks → ok · none → danger · partial credit → warn. */
export function markTone(marks: number, points: number): MarkTone {
  if (marks >= points && points > 0) return "ok";
  if (marks <= 0) return "danger";
  return "warn";
}

/** "2.5" not "2.50"; "3" not "3.00" — numeric columns arrive with scale. */
export function fmtMarks(n: number): string {
  return String(Number(n.toFixed(2)));
}

/* ── Typed marks (teacher's marking screen) ───────────────────────────── */

export type ParsedMark = { value: number | null; valid: boolean };

/** Digits with at most one point: "3", "2.5", ".5", and "2." mid-keystroke. */
const MARK_PATTERN = /^\d*\.?\d*$/;

/**
 * A mark as the teacher typed it. The field is plain text — deliberately, so it
 * has no spinner arrows — which means `min`/`max`/`step` no longer police it and
 * this does instead.
 *
 * Blank is `{ value: null, valid: true }`: an unmarked answer is a normal state
 * on the way to approving, not an error, and approval already falls back to the
 * automatic mark for anything the teacher left alone.
 *
 * Too high keeps the number and fails: the teacher sees the 50 they typed,
 * flagged, rather than a silent 5. Unparseable text — including anything
 * carrying a sign, since the pattern admits no "-" — reports no value at all.
 * Nothing that parses can be negative, so only the upper bound is checked.
 */
export function parseMarkInput(raw: string, max: number): ParsedMark {
  const trimmed = raw.trim();
  if (trimmed === "") return { value: null, valid: true };
  if (!MARK_PATTERN.test(trimmed)) return { value: null, valid: false };
  const n = Number(trimmed);
  // "." alone matches the pattern but parses to NaN
  if (!Number.isFinite(n)) return { value: null, valid: false };
  return { value: n, valid: n <= max };
}
