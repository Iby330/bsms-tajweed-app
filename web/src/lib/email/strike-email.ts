import { C, SITE, button, esc, panel, para, row, shell } from "./applicant-emails";
import { teacherTitle } from "./marked-email";

/**
 * The two strike emails: "you've received a strike", sent when a teacher
 * issues one (from the strike manager or an absence on the register), and
 * "a strike has been removed", sent when one the student was emailed about
 * is taken back.
 *
 * Pure, like the emails beside it: no database, no network, so it can be
 * tested and previewed directly.
 *
 * REASON ONLY, NEVER THE NOTE. The teacher's note is the record of why, and
 * the student can read it in the app, but an email is far easier to forward
 * than a screen, and a conduct note is not something to send round. The
 * owner decided this on 2026-10-19; strike-email.test.ts holds it.
 *
 * No em dashes anywhere a user reads (house style, see migration 0034).
 */

export type StrikeEmailReason = "absence" | "homework" | "conduct" | string;

export type StrikeMail = {
  firstName: string;
  reason: StrikeEmailReason;
  /** When the strike was issued, as stored (timestamptz). */
  issuedAt: string | null;
  /** This term's strikes once the change has landed: including the new one,
   *  or without the one just removed. */
  count: number;
  /** Who issued it, or who took it back. Null falls back to "Your teacher". */
  teacher: { fullName: string | null; section: string | null } | null;
};

/** Three in a term means leaving the course (strike-dots.tsx says the same). */
export const STRIKE_LIMIT = 3;

export const strikesLink = `${SITE}/home`;

const REASON: Record<string, { label: string; phrase: string }> = {
  absence: { label: "Absence", phrase: "an absence" },
  homework: { label: "Missed homework", phrase: "missed homework" },
  conduct: { label: "Conduct", phrase: "conduct" },
};
const reasonOf = (r: string) => REASON[r] ?? { label: r, phrase: r };

/** The day, in the UK: the server runs in UTC, and a strike at 00:30 on a
 *  summer night belongs to the day the teacher saw. */
export function issuedDay(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "long", timeZone: "Europe/London",
  }).format(new Date(ms));
}

/** "2 of 3", or plain "4" once past the limit, where "of 3" reads as an error. */
const tally = (n: number) => (n <= STRIKE_LIMIT ? `${n} of ${STRIKE_LIMIT}` : `${n}`);

/** What the count means, in the same words as the strikes box on the home page. */
export function standingLine(n: number): string {
  if (n <= 0) return "You have no strikes this term.";
  if (n === 1) return "Two more this term would mean leaving the course.";
  if (n === 2) return "One more this term means leaving the course.";
  return "That is three this term, which means leaving the course. Your teacher will be in touch about what happens next.";
}

const by = (m: StrikeMail) => teacherTitle(m.teacher) ?? "Your teacher";

/* ── 1. You've received a strike ──────────────────────────────────────── */

export const issuedSubject = (m: StrikeMail) =>
  `You've received a strike: ${tally(m.count)} this term`;

function issuedIntro(m: StrikeMail): string {
  const day = issuedDay(m.issuedAt);
  return `${by(m)} has given you a strike for ${reasonOf(m.reason).phrase}${day ? ` on ${day}` : ""}.`;
}

export function issuedText(m: StrikeMail): string {
  return [
    `Assalamu alaikum ${m.firstName},`,
    ``,
    issuedIntro(m),
    ``,
    `Strikes this term: ${tally(m.count)}`,
    standingLine(m.count),
    ``,
    `Strikes reset at the start of each term. If you think this is a mistake, speak to your teacher.`,
    ``,
    `See your strikes in the app: ${strikesLink}`,
    ``,
    `BSMS Tajweed`,
  ].join("\n");
}

export function issuedHtml(m: StrikeMail): string {
  const day = issuedDay(m.issuedAt);
  const reason = reasonOf(m.reason).label;
  const body = [
    row(para(`Assalamu alaikum ${esc(m.firstName)},`, 17)),
    row(para(esc(issuedIntro(m)))),
    row(panel("Strikes this term", esc(tally(m.count)), `${esc(reason)}${day ? ` &middot; ${esc(day)}` : ""}`)),
    row(para(`<strong>${esc(standingLine(m.count))}</strong>`, 15)),
    row(para("Strikes reset at the start of each term. If you think this is a mistake, speak to your teacher.", 15)),
    `<tr><td align="center" style="padding:0 34px;">${button(strikesLink, "See your strikes")}</td></tr>`,
    row(`<p style="margin:8px 0 0 0;font-size:13px;line-height:1.6;color:${C.muted};">
      Button not working? Go to <a href="${esc(strikesLink)}" style="color:${C.ink};">${esc(strikesLink.replace("https://www.", ""))}</a>.
    </p>`),
  ].join("\n");

  return shell({
    title: issuedSubject(m),
    preheader: esc(`${reason}. ${standingLine(m.count)}`),
    body,
    footer: "BSMS Tajweed &middot; sent because a strike was recorded on your account.",
  });
}

/* ── 2. A strike has been removed ─────────────────────────────────────── */

export const removedSubject = () => "A strike has been removed";

function removedIntro(m: StrikeMail): string {
  const day = issuedDay(m.issuedAt);
  return `${by(m)} has taken back the strike for ${reasonOf(m.reason).phrase}${day ? ` from ${day}` : ""}. You don't have it any more.`;
}

export function removedText(m: StrikeMail): string {
  return [
    `Assalamu alaikum ${m.firstName},`,
    ``,
    removedIntro(m),
    ``,
    `Strikes this term: ${tally(m.count)}`,
    standingLine(m.count),
    ``,
    `See your strikes in the app: ${strikesLink}`,
    ``,
    `BSMS Tajweed`,
  ].join("\n");
}

export function removedHtml(m: StrikeMail): string {
  const body = [
    row(para(`Assalamu alaikum ${esc(m.firstName)},`, 17)),
    row(para(esc(removedIntro(m)))),
    row(panel("Strikes this term", esc(tally(m.count)), "Strike removed")),
    row(para(esc(standingLine(m.count)), 15)),
    `<tr><td align="center" style="padding:0 34px;">${button(strikesLink, "See your strikes")}</td></tr>`,
    row(`<p style="margin:8px 0 0 0;font-size:13px;line-height:1.6;color:${C.muted};">
      Button not working? Go to <a href="${esc(strikesLink)}" style="color:${C.ink};">${esc(strikesLink.replace("https://www.", ""))}</a>.
    </p>`),
  ].join("\n");

  return shell({
    title: removedSubject(),
    preheader: esc(`You now have ${tally(m.count)} strikes this term.`),
    body,
    footer: "BSMS Tajweed &middot; sent because a strike on your account was taken back.",
  });
}
