"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { markSurahPassed, setSurahComment, unmarkSurah } from "@/lib/hifz/actions";
import { hizbOf, HIZB_BOUNDS } from "@/lib/hifz/hizb";
import { SURAH_META } from "@/lib/hifz/surah-meta";
import { fmtDay } from "@/lib/format";
import { cn } from "@/lib/utils";

const cellId = (surahNumber: number) => `hifz-cell-${surahNumber}`;

export type MarkRow = {
  number: number;
  name_en: string;
  name_ar: string;
  passed: boolean;
  comment: string | null;
  /** date, or null when the surah has no record yet */
  passedAt: string | null;
};

/**
 * The marking grid — the student's own mushaf index, made writable.
 *
 * The teacher used to sign surahs off down a list of forty-odd rows, which
 * gave away the one thing the student's view has: the run as a single shape,
 * banded by hizb, so where a student actually is takes no reading. This is
 * that grid with the marking attached, and the same page now looks like the
 * page the student is looking at when they talk about it.
 *
 * Selecting a cell opens the sign-off panel under its own band, rather than
 * putting a Pass button on every cell. Marking is deliberate — it follows a
 * recitation — and one panel has room to say what the cell cannot: the āyah
 * count, the date it was heard, and the comment in full rather than clipped.
 *
 * Comments are editable on a surah already passed. That was impossible in the
 * list: the comment box only existed on the way to marking, so fixing a typo
 * meant undoing the pass and losing the date with it.
 */
export function HifzGrid({
  studentId,
  rows,
  expected,
}: {
  studentId: string;
  rows: MarkRow[];
  expected: number;
}) {
  const router = useRouter();
  const [sel, setSel] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /** Closing hands focus back to the cell that opened the panel — the panel
   *  takes focus when it opens, so without this a keyboard user lands on the
   *  document body and has to tab through the whole grid again. */
  const close = () => {
    const id = sel;
    setSel(null);
    if (id !== null) requestAnimationFrame(() => document.getElementById(cellId(id))?.focus());
  };

  // Escape closes the panel — it is a transient editor over a grid the
  // teacher is scanning, and reaching for the × with a mouse is the slow way.
  useEffect(() => {
    if (sel === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSel(null);
      requestAnimationFrame(() => document.getElementById(cellId(sel))?.focus());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel]);

  if (rows.length === 0) return null;

  const passedCount = rows.filter((r) => r.passed).length;
  const currentIdx = rows.findIndex((r) => !r.passed); // -1 → whole run passed
  // Same rule as the student's view: no marker before there is an expectation,
  // none when it lands on the surah they are already on, none when on pace.
  const rawMarker = expected > 0 ? Math.min(expected, rows.length) - 1 : null;
  const markerIdx =
    rawMarker !== null && currentIdx !== -1 && rawMarker !== currentIdx && expected !== passedCount
      ? rawMarker
      : null;

  // Contiguous hizb groups over the run, each item keeping its global index.
  const groups: { hizb: number; items: { r: MarkRow; i: number }[] }[] = [];
  rows.forEach((r, i) => {
    const h = hizbOf(r.number);
    if (h === null) return;
    const last = groups[groups.length - 1];
    if (last && last.hizb === h) last.items.push({ r, i });
    else groups.push({ hizb: h, items: [{ r, i }] });
  });

  const open = (r: MarkRow) => {
    if (sel === r.number) {
      setSel(null);
      return;
    }
    setSel(r.number);
    setComment(r.comment ?? "");
    setMessage(null);
  };

  /** Every action ends the same way: refresh, and say what happened. */
  const run = (work: () => Promise<void>, said: string) =>
    startTransition(async () => {
      await work();
      setMessage(said);
      router.refresh();
    });

  return (
    <section className="box c12 hifzindex" aria-label="Hifdh marking grid">
      <p className="note" aria-live="polite">
        {message ?? "Select a surah to sign it off, or to leave the student a comment."}
      </p>

      {groups.map((g) => {
        const bound = HIZB_BOUNDS.find((b) => b.hizb === g.hizb);
        const inHizb = bound ? bound.to - bound.from + 1 : g.items.length;
        const done = g.items.filter((x) => x.r.passed).length;
        // "Ready for the check" only when the WHOLE hizb is on this student's
        // run and passed — a partial hizb can never be checked.
        const ready = done === g.items.length && g.items.length === inHizb;
        const holds = g.items.find((x) => x.r.number === sel);

        return (
          <div key={g.hizb}>
            <div className="band">
              <span className="t">Hizb {g.hizb}</span>
              <span className="r" />
              <span className={cn("st", !ready && "wait")}>
                {done} of {g.items.length}
                {ready && " · ready for the check"}
              </span>
            </div>

            <div className="index">
              {g.items.map(({ r, i }) => {
                const meta = SURAH_META[r.number];
                return (
                  <button
                    key={r.number}
                    id={cellId(r.number)}
                    type="button"
                    onClick={() => open(r)}
                    aria-expanded={sel === r.number}
                    className={cn(
                      "cell",
                      r.passed && "done",
                      i === currentIdx && "next",
                      sel === r.number && "sel",
                    )}
                  >
                    <span className="n">{String(i + 1).padStart(2, "0")}</span>
                    {i === currentIdx && <span className="tag">NEXT</span>}
                    {r.comment && (
                      <span className="cmt" aria-hidden>
                        <svg viewBox="0 0 24 24">
                          <path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-5 4V5a1 1 0 0 1 1-1z" />
                        </svg>
                      </span>
                    )}
                    <span dir="rtl" lang="ar" className="ar-quran">{r.name_ar}</span>
                    <span className="en">
                      {r.name_en}
                      <span className="sr-only">
                        {meta && `, ${meta.meaning}`}
                        {r.passed ? ", signed off" : ", not signed off"}
                        {r.comment && ", has a comment"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            {holds && (
              <MarkPanel
                studentId={studentId}
                row={holds.r}
                position={holds.i + 1}
                total={rows.length}
                comment={comment}
                setComment={setComment}
                pending={pending}
                onClose={close}
                run={run}
              />
            )}

            {markerIdx !== null && g.items.some((x) => x.i === markerIdx) && (
              <div className="paceline">
                <span className="t">Expected here by now</span>
                <span className="r" />
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

/** The sign-off panel: one surah, attached to the bottom of its own band. */
function MarkPanel({
  studentId,
  row,
  position,
  total,
  comment,
  setComment,
  pending,
  onClose,
  run,
}: {
  studentId: string;
  row: MarkRow;
  position: number;
  total: number;
  comment: string;
  setComment: (v: string) => void;
  pending: boolean;
  onClose: () => void;
  run: (work: () => Promise<void>, said: string) => void;
}) {
  const meta = SURAH_META[row.number];
  const dirty = comment.trim() !== (row.comment ?? "").trim();
  const panel = useRef<HTMLDivElement>(null);

  // The panel takes focus, not the textarea: autofocusing a field throws up
  // the keyboard on a phone over a panel whose first action is usually a
  // button, and the teacher marking on a laptop still lands here, one Tab
  // from the comment and with Escape already live.
  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
  }, [row.number]);

  return (
    <div className="markpanel" ref={panel} tabIndex={-1}>
      <div className="head">
        <span dir="rtl" lang="ar" className="ar-quran ar-panel">{row.name_ar}</span>
        <span className="who">
          <b>{row.name_en}</b>
          <span className="facts">
            {meta && <span>{meta.ayahs} āyāt</span>}
            <span>
              {position} of {total}
            </span>
            <span className={cn(row.passed && "hi")}>
              {row.passed
                ? row.passedAt
                  ? `Heard ${fmtDay(row.passedAt)}`
                  : "Signed off"
                : "Not signed off"}
            </span>
          </span>
        </span>
        <button
          type="button"
          className="iconbtn"
          onClick={onClose}
          aria-label="Close"
          title="Close"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <label className="label" htmlFor="hifz-comment">
        Comment for the student
      </label>
      <Textarea
        id="hifz-comment"
        rows={2}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="e.g. Tighten the madd in āyah 3 — the student reads this…"
      />

      <div className="acts">
        {row.passed ? (
          <>
            <Button
              size="sm"
              disabled={pending || !dirty}
              onClick={() =>
                run(
                  () => setSurahComment(studentId, row.number, comment),
                  `Comment saved for ${row.name_en}.`,
                )
              }
            >
              {pending ? "Saving…" : "Save comment"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                run(
                  () => unmarkSurah(studentId, row.number),
                  `${row.name_en} is no longer signed off.`,
                )
              }
            >
              Undo pass
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              run(
                () => markSurahPassed(studentId, row.number, comment),
                `${row.name_en} signed off.`,
              )
            }
          >
            {pending ? "Saving…" : "Mark passed"}
          </Button>
        )}
        <span className="hint">
          {row.passed
            ? "Undoing removes the date it was heard on."
            : "The comment is optional, and visible to the student."}
        </span>
      </div>
    </div>
  );
}
