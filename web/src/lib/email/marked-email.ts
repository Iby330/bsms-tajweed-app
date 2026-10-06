import { C, FONT, SITE, button, esc, heading, panel, para, row, shell } from "./applicant-emails";
import { fmtMarks, markTone, selectedOf, textOf } from "@/lib/homework/logic";
import { questionLabels } from "@/lib/homework/letters";
import { isTapWords, unpackWord, type TapOption } from "@/lib/homework/tap-words";
import { REDO_THRESHOLD_PCT } from "@/lib/marking/redo";

/**
 * "Your homework is marked", sent when a teacher approves a submission.
 *
 * Pure, like the applicant emails beside it: no database, no network, so it
 * can be tested and previewed directly. It carries what the student's own
 * marked paper shows (their answer, the mark, the teacher's comment) and no
 * more. In particular it never prints the answer key: the app does not show
 * a student the right option after marking, and an email is far easier to
 * pass round a class than a screen.
 *
 * No em dashes anywhere a user reads (house style, see migration 0034).
 */

export type MarkedQuestion = {
  id: string;
  qtype: string;
  prompt: string;
  points: number;
  is_bonus: boolean;
  is_task: boolean;
  options: unknown;
};

export type MarkedAnswer = {
  question_id: string;
  response: unknown;
  final_marks: number | null;
  teacher_comment: string | null;
};

export type MarkedHomework = {
  firstName: string;
  homeworkNumber: number;
  homeworkTitle: string;
  /** Who marked it: their full name and section, which decides the title. */
  teacher: { fullName: string | null; section: string | null } | null;
  /** Ungraded homework has no score line, only the answers and comments. */
  graded: boolean;
  /** The verdict `approveSubmission` acted on, or null when none was possible. */
  pct: number | null;
  /** Sent back below the redo threshold: the paper is blank again. */
  redo: boolean;
  questions: MarkedQuestion[];
  answers: MarkedAnswer[];
};

type Option = { position: number; label: string; value: string };

function optionsOf(raw: unknown): Option[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((o) => {
    if (typeof o !== "object" || o === null) return [];
    const { position, label, value } = o as Record<string, unknown>;
    if (typeof position !== "number") return [];
    return [{
      position,
      label: typeof label === "string" ? label : "",
      value: typeof value === "string" ? value : "",
    }];
  });
}

/**
 * What the student put, as one line of text, or null for nothing at all.
 *
 * Options read as the student saw them (`value`, else `label`, as the form
 * draws them). A tapped passage reads as the words tapped, not their packed
 * glyph form. A practical task is a recording, which an email cannot play.
 */
export function answerText(q: MarkedQuestion, response: unknown): string | null {
  if (q.is_task) return "Your recording (listen to it in the app)";
  const options = optionsOf(q.options);
  if (options.length) {
    const picked = selectedOf(response);
    if (!picked.length) return null;
    const byPos = new Map(options.map((o) => [o.position, o]));
    const tap = isTapWords(q.options as TapOption[]);
    const words = picked
      .slice()
      .sort((a, b) => a - b)
      .flatMap((p) => {
        const o = byPos.get(p);
        if (!o) return [];
        const shown = o.value || o.label;
        return [tap ? unpackWord(shown).text : shown];
      });
    return words.length ? words.join(tap ? " " : ", ") : null;
  }
  if (typeof response === "object" && response !== null && "grid" in response) {
    const grid = (response as { grid: unknown }).grid;
    if (grid && typeof grid === "object") {
      const cells = Object.entries(grid as Record<string, unknown>)
        .filter(([, v]) => typeof v === "string" && v.trim())
        .map(([k, v]) => `${k}: ${String(v).trim()}`);
      return cells.length ? cells.join("; ") : null;
    }
  }
  const text = textOf(response).trim();
  return text || null;
}

type Verdict = "right" | "partly" | "wrong" | "task";

function verdictOf(q: MarkedQuestion, marks: number | null): Verdict {
  if (q.is_task) return "task";
  const tone = markTone(marks ?? 0, q.points);
  return tone === "ok" ? "right" : tone === "danger" ? "wrong" : "partly";
}

const VERDICT_LABEL: Record<Verdict, string> = {
  right: "Right",
  partly: "Partly right",
  wrong: "Wrong",
  task: "Practical task",
};

/** The score as the student's paper shows it: every mark, over the non-bonus points. */
export function scoreOf(h: MarkedHomework): { marks: number; outOf: number } {
  const marks = h.answers.reduce((s, a) => s + (a.final_marks ?? 0), 0);
  const outOf = h.questions.filter((q) => !q.is_bonus).reduce((s, q) => s + q.points, 0);
  return { marks, outOf };
}

export const homeworkLink = (n: number) => `${SITE}/homework/${n}`;

export function markedSubject(h: MarkedHomework): string {
  const name = `Homework ${h.homeworkNumber}`;
  if (h.redo) return `${name} is marked: please redo it`;
  if (!h.graded) return `${name} is marked`;
  const { marks, outOf } = scoreOf(h);
  return `${name} is marked: ${fmtMarks(marks)}/${fmtMarks(outOf)}`;
}

function scoreLine(h: MarkedHomework): string {
  const { marks, outOf } = scoreOf(h);
  const pct = h.pct === null ? "" : ` (${Math.round(h.pct)}%)`;
  return `${fmtMarks(marks)} / ${fmtMarks(outOf)}${pct}`;
}

/**
 * How a student names their teacher: Ustadha for the sisters' teachers,
 * Ustadh for the brothers', and the first name. Null when either is missing,
 * so the email falls back to "Your teacher" rather than guess.
 */
export function teacherTitle(t: MarkedHomework["teacher"]): string | null {
  const first = t?.fullName?.trim().split(/\s+/)[0];
  if (!first) return null;
  if (t?.section === "sisters") return `Ustadha ${first}`;
  if (t?.section === "brothers") return `Ustadh ${first}`;
  return null;
}

function intro(h: MarkedHomework): string {
  const title = teacherTitle(h.teacher);
  const by = title ? `${title} has` : "Your teacher has";
  return `${by} marked Homework ${h.homeworkNumber}, ${h.homeworkTitle}.`;
}

function redoLine(): string {
  return `That is below the ${REDO_THRESHOLD_PCT}% pass mark, so it has been sent back for you to do again. `
    + "The paper is blank again in the app: answer every question again and hand it in.";
}

type Item = {
  label: string;
  q: MarkedQuestion;
  answer: string | null;
  marks: number | null;
  verdict: Verdict;
  comment: string | null;
};

function items(h: MarkedHomework): Item[] {
  const labels = questionLabels(h.questions);
  const byQ = new Map(h.answers.map((a) => [a.question_id, a]));
  return h.questions.map((q, i) => {
    const a = byQ.get(q.id);
    const marks = a?.final_marks ?? null;
    return {
      label: labels[i],
      q,
      answer: answerText(q, a?.response),
      marks,
      verdict: verdictOf(q, marks),
      comment: a?.teacher_comment?.trim() || null,
    };
  });
}

/* ── plain text ───────────────────────────────────────────────────────── */

export function markedText(h: MarkedHomework): string {
  const link = homeworkLink(h.homeworkNumber);
  const lines = [
    `Assalamu alaikum ${h.firstName},`,
    ``,
    intro(h),
    ``,
    ...(h.graded ? [`Your mark: ${scoreLine(h)}`, ``] : []),
    ...(h.redo ? [redoLine(), ``] : []),
    `Question by question`,
    ``,
  ];
  for (const it of items(h)) {
    const mark = it.q.is_task ? "" : ` (${fmtMarks(it.marks ?? 0)}/${fmtMarks(it.q.points)})`;
    lines.push(`Question ${it.label}${it.q.is_bonus ? " (bonus)" : ""}: ${VERDICT_LABEL[it.verdict]}${mark}`);
    lines.push(it.q.prompt.trim());
    lines.push(`Your answer: ${it.answer ?? "No answer given"}`);
    if (it.comment) lines.push(`From your teacher: ${it.comment}`);
    lines.push(``);
  }
  lines.push(
    h.redo ? `Do it again here: ${link}` : `See it in the app: ${link}`,
    ``,
    `BSMS Tajweed`,
  );
  return lines.join("\n");
}

/* ── HTML ─────────────────────────────────────────────────────────────── */

/** Dark text on a pale fill, each pair readable (the same tones as the app's badges). */
const TONE: Record<Verdict, { bg: string; fg: string; mark: string }> = {
  right: { bg: "#e3edd2", fg: "#2f4a12", mark: "&#10003;" },
  partly: { bg: "#fbecd0", fg: "#6b4300", mark: "&plusmn;" },
  wrong: { bg: "#f8dcdc", fg: "#8a1c1c", mark: "&#10007;" },
  task: { bg: C.page, fg: C.muted, mark: "&#9835;" },
};

/** dir="auto": prompts and answers are often Arabic, and the browser picks the direction. */
const multiline = (s: string) => esc(s).replace(/\n/g, "<br>");

function questionHtml(it: Item): string {
  const t = TONE[it.verdict];
  const badge = it.q.is_task
    ? VERDICT_LABEL.task
    : `${t.mark} ${VERDICT_LABEL[it.verdict]} &middot; ${fmtMarks(it.marks ?? 0)}/${fmtMarks(it.q.points)}`;
  const answer = it.answer
    ? `<div dir="auto" style="font-size:15px;line-height:1.6;color:${C.ink};">${multiline(it.answer)}</div>`
    : `<div style="font-size:15px;line-height:1.6;color:${C.muted};font-style:italic;">No answer given</div>`;
  const comment = it.comment
    ? `<div style="margin-top:10px;padding:8px 10px;background:${C.page};border-radius:6px;">
        <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${C.muted};">From your teacher</div>
        <div dir="auto" style="font-size:14px;line-height:1.55;color:${C.ink};padding-top:2px;">${multiline(it.comment)}</div>
      </div>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="border:1px solid ${C.border};border-radius:10px;margin:0 0 12px 0;">
  <tr><td style="padding:14px 16px;font-family:${FONT};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:${C.muted};font-family:${FONT};">Question ${esc(it.label)}${it.q.is_bonus ? " &middot; bonus" : ""}</td>
      <td align="right" style="font-family:${FONT};"><span style="display:inline-block;padding:3px 8px;border-radius:6px;background:${t.bg};color:${t.fg};font-size:12px;font-weight:700;white-space:nowrap;">${badge}</span></td>
    </tr></table>
    <div dir="auto" style="font-size:15px;line-height:1.55;color:${C.ink};padding:8px 0 10px 0;">${multiline(it.q.prompt.trim())}</div>
    <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${C.muted};padding-bottom:2px;">Your answer</div>
    ${answer}
    ${comment}
  </td></tr>
</table>`;
}

export function markedHtml(h: MarkedHomework): string {
  const link = homeworkLink(h.homeworkNumber);
  const name = `Homework ${h.homeworkNumber}`;
  const status = h.redo ? "Sent back to redo" : "Marked";

  const body = [
    row(para(`Assalamu alaikum ${esc(h.firstName)},`, 17)),
    row(para(esc(intro(h)))),
    row(panel(
      name,
      h.graded ? esc(scoreLine(h)) : status,
      h.graded ? `${status} &middot; ${esc(h.homeworkTitle)}` : esc(h.homeworkTitle),
    )),
    ...(h.redo ? [row(para(`<strong>${esc(redoLine())}</strong>`, 15))] : []),
    `<tr><td align="center" style="padding:0 34px;">${button(link, h.redo ? `Redo ${name}` : `Open ${name}`)}</td></tr>`,
    row(heading("Question by question") + items(h).map(questionHtml).join("\n")),
    row(`<p style="margin:8px 0 0 0;font-size:13px;line-height:1.6;color:${C.muted};">
      Recordings, and anything your teacher adds later, are in the app.
      Button not working? Go to <a href="${esc(link)}" style="color:${C.ink};">${esc(link.replace("https://www.", ""))}</a>.
    </p>`),
  ].join("\n");

  return shell({
    title: markedSubject(h),
    preheader: h.redo
      ? `${name} needs doing again. Here is how each question went.`
      : h.graded
        ? `You got ${esc(scoreLine(h))}. Here is how each question went.`
        : "Here is how each question went.",
    body,
    footer: "BSMS Tajweed &middot; sent because your teacher marked your homework.<br>Questions about your mark? Ask your teacher in class.",
  });
}
