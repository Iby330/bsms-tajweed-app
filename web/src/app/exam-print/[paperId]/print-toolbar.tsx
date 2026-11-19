"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Screen-only controls above the printed paper (print.css hides them).
 *
 * Also sizes the Qur'anic pictures. A picture's pixel height is roughly its
 * number of lines of mushaf text (~170px a line in the source documents), and
 * that is what decides how tall it may print: one line is capped at 22mm so a
 * single word is not blown up, a five-line passage gets room to stay legible.
 * Until this runs every picture keeps print.css's one-line cap, which is the
 * safe side to err on.
 */

const LINE_PX = 170;
const LINE_MM = 22;
const MAX_MM = 75;

function fitPicture(img: HTMLImageElement) {
  if (!img.naturalHeight) return;
  const lines = Math.max(1, Math.round(img.naturalHeight / LINE_PX));
  // An option's picture sits in a list of five: a smaller line.
  const line = img.closest(".exam-q-options") ? 13 : LINE_MM;
  const mm = Math.min(MAX_MM, lines === 1 ? line : lines * 16);
  img.style.setProperty("max-height", `${mm}mm`, "important");
}

function pictures(): HTMLImageElement[] {
  return Array.from(document.querySelectorAll<HTMLImageElement>(".ep-sheet img"));
}

/** Resolves once every picture has loaded or failed: a half-loaded picture would print blank. */
function picturesSettled(): Promise<void> {
  return Promise.all(
    pictures().map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          }),
    ),
  ).then(() => undefined);
}

export function PrintToolbar({ paperId, scheme }: { paperId: string; scheme: boolean }) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const imgs = pictures();
    const onLoad = (e: Event) => fitPicture(e.currentTarget as HTMLImageElement);
    for (const img of imgs) {
      if (img.complete) fitPicture(img);
      else img.addEventListener("load", onLoad, { once: true });
    }
    return () => imgs.forEach((img) => img.removeEventListener("load", onLoad));
  }, [paperId, scheme]);

  async function print() {
    setBusy(true);
    try {
      await Promise.all([document.fonts.ready, picturesSettled()]);
      pictures().forEach(fitPicture);
      window.print();
    } finally {
      setBusy(false);
    }
  }

  const base = `/exam-print/${paperId}`;
  return (
    <div className="ep-toolbar" role="toolbar" aria-label="Print controls">
      <div className="ep-toolbar-row">
        {/* A full page load, not a client navigation: it drops this page's @page rules. */}
        <a href={`/teacher/exam-builder/${paperId}`} className="ep-btn ep-btn--plain">
          ← Back to the builder
        </a>
        <nav className="ep-switch" aria-label="View">
          <Link href={base} className={scheme ? "" : "is-on"} aria-current={scheme ? undefined : "page"}>
            Paper
          </Link>
          <Link href={`${base}?scheme=1`} className={scheme ? "is-on" : ""} aria-current={scheme ? "page" : undefined}>
            Mark scheme
          </Link>
        </nav>
        <button type="button" className="ep-btn ep-btn--primary" onClick={print} disabled={busy}>
          {busy ? "Preparing…" : "Print / Save as PDF"}
        </button>
      </div>
      <p className="ep-toolbar-tip">In the print window choose A4 and turn off &lsquo;Headers and footers&rsquo;.</p>
    </div>
  );
}
