/**
 * Pure homework logic — response-shape builders, lateness, countdown
 * bucketing, status chips. No IO: everything here is unit-testable.
 *
 * Response shapes (answers.response jsonb):
 *   mcq / checkbox → {"selected":[positions]}
 *   text / paragraph → {"text":"…"}
 *   grid → {"grid":{"rowLabel":"colLabel"}} — the student RPC exposes no grid
 *   structure (options are null), so the form falls back to a text answer.
 *   task → {"voice":"<storage path>"} — a recitation. The row exists so the
 *   teacher's comment has somewhere to live; the audio itself is in Storage.
 */

import { REDO_THRESHOLD_PCT } from "@/lib/marking/redo";

export type QType = "mcq" | "checkbox" | "text" | "paragraph" | "grid";
export type SubStatus = "draft" | "submitted" | "auto_marked" | "approved";

export type SelectedResponse = { selected: number[] };
export type TextResponse = { text: string };
export type GridResponse = { grid: Record<string, string> };
export type VoiceResponse = { voice: string };
export type AnswerResponse =
  | SelectedResponse
  | TextResponse
  | GridResponse
  | VoiceResponse;

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

/** The answer to a task question is the recording's path in Storage. */
export function voiceResponse(storagePath: string): VoiceResponse {
  return { voice: storagePath };
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

export function voiceOf(response: unknown): string {
  if (typeof response !== "object" || response === null) return "";
  const v = (response as VoiceResponse).voice;
  return typeof v === "string" ? v : "";
}

export function responseIsEmpty(response: unknown): boolean {
  if (typeof response !== "object" || response === null) return true;
  const r = response as Partial<
    SelectedResponse & TextResponse & GridResponse & VoiceResponse
  >;
  if (Array.isArray(r.selected)) return r.selected.length === 0;
  if (typeof r.text === "string") return r.text.trim() === "";
  if (typeof r.voice === "string") return r.voice.trim() === "";
  if (r.grid && typeof r.grid === "object")
    return Object.keys(r.grid).length === 0;
  return true;
}

/**
 * The task questions with nothing recorded against them — what stands between
 * a student and handing in. Generic in the question so the form can run it
 * over the paper it already holds and `submitHomework` over the one it reads
 * back, without either shape having to match the other exactly.
 */
export function missingTaskRecordings<Q extends { id: string; is_task: boolean }>(
  questions: Q[],
  notes: { question_id: string }[],
): Q[] {
  const recorded = new Set(notes.map((n) => n.question_id));
  return questions.filter((q) => q.is_task && !recorded.has(q.id));
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

export type ChipTone = "muted" | "warn" | "ink" | "ok" | "danger";

/**
 * Student-facing status. `auto_marked` deliberately reads as "Submitted" —
 * marking is invisible to students until the teacher approves.
 *
 * `redo` is the homework's attempt number, when it has one. A draft on
 * attempt 2 or later is not work never started: it is work that came back,
 * and saying "Draft" for it would hide the only thing the student needs to
 * know. Past the hand-in it stops mattering — a redo with the teacher is a
 * submission like any other — so only `draft` reads the argument at all.
 */
export function statusChip(
  status: SubStatus | null | undefined,
  redo?: { attempt: number } | null,
): {
  label: string;
  tone: ChipTone;
} {
  switch (status) {
    case "draft":
      return redo && redo.attempt > 1
        ? { label: "Redo", tone: "danger" }
        : { label: "Draft", tone: "warn" };
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

/**
 * A percentage's tone: 80 and up reads well, 50 and up needs a look, below
 * that needs a conversation. The same three bands the homework screens have
 * always coloured a percentage with, in one place so a class average and a
 * student's own mark are never coloured by different rules.
 */
export function pctTone(pct: number): MarkTone {
  if (pct >= 80) return "ok";
  if (pct >= 50) return "warn";
  return "danger";
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

/* ── What needs the student today (home hero) ─────────────────────────── */

export type AttentionKind = "redo" | "overdue";

/**
 * The one box under the greeting, which used to list overdue homework alone
 * and now lists work sent back as well.
 *
 * Redos come first: that work has already been read once by a teacher who is
 * waiting on it again. The two lists overlap — a redo's original deadline is
 * by definition in the past, so it qualifies as overdue too — and a box that
 * says "one thing needs you" must not then print two rows for it, hence the
 * de-duplication by homework id.
 *
 * Generic in the entry so it can run over `HomeworkEntry` without this module
 * importing the curriculum tree; all it needs is something to tell rows apart.
 */
export function attentionList<T extends { homework: { id: string } }>(
  overdue: T[],
  redos: T[],
): { kind: AttentionKind; entry: T }[] {
  const listed = new Set(redos.map((e) => e.homework.id));
  return [
    ...redos.map((entry) => ({ kind: "redo" as const, entry })),
    ...overdue
      .filter((e) => !listed.has(e.homework.id))
      .map((entry) => ({ kind: "overdue" as const, entry })),
  ];
}

/**
 * What to call the box. Naming the single kind it holds is more useful than a
 * catch-all, and "Needs you" is what is left when it holds both.
 */
export function attentionHeading(
  items: { kind: AttentionKind }[],
): "Redo" | "Overdue" | "Needs you" {
  const kinds = new Set(items.map((i) => i.kind));
  if (kinds.size === 1) return kinds.has("redo") ? "Redo" : "Overdue";
  return "Needs you";
}

/**
 * The line above a redo's blank form. The threshold comes from the marking
 * rule rather than being typed out again, so the sentence a student reads and
 * the comparison that sent them here can never disagree.
 *
 * `previousPct` is null only for a row that predates the column being
 * recorded; there is still a redo to explain, just no mark to quote.
 */
export function redoNotice(previousPct: number | null): string {
  if (previousPct === null) {
    return `You need ${REDO_THRESHOLD_PCT}% to pass this homework.`;
  }
  return `You scored ${Math.round(previousPct)}% last time and need ${REDO_THRESHOLD_PCT}%.`;
}
