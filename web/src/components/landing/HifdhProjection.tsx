"use client";

import NumberFlow from "@number-flow/react";
import { useEffect, useState } from "react";
import { MILESTONES } from "@/lib/hifz/projection";
import { RUN } from "@/lib/hifz/run";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";

/**
 * Two juz, An-Nas to Al-Mulk, as a chart that fills itself in.
 *
 * The structure is the reference page's: a long list streaming past BEHIND a
 * card, and in the card a small chart whose points land one at a time. Theirs
 * says "there is a lot you could be tested for, and here is your result"; this
 * says "here is the whole run, and here is how it adds up".
 *
 * ── Why the points are milestones, not dates ───────────────────────────────
 * A date axis means asserting a pace, and the programme sets targets per
 * student. So the three points are the waypoints a student would actually name
 * — the first hizb, the first juz, the whole run — read from the same bounds
 * the app uses. Nothing here is a promise about speed.
 *
 * ── Why ayahs on the vertical axis ─────────────────────────────────────────
 * Surahs against milestones is close to a straight line. Ayahs is not: the
 * short surahs come first, so the curve bends upward as the long Tabarak
 * surahs arrive — 288, then 564, then 995. That shape is true, and it is the
 * difference between a chart and a picture of a chart.
 */

const TOTAL = MILESTONES[MILESTONES.length - 1].ayahs;

/* Chart geometry, in viewBox units. */
const VB = { w: 600, h: 400 };
const BASE = 300; // y of the zero line
const TOP = 78; // y the final point reaches, leaving room for its rings
const XS = [190, 365, 540];
const yOf = (ayahs: number) => BASE - (ayahs / TOTAL) * (BASE - TOP);
const PTS = MILESTONES.map((m, i) => ({ ...m, x: XS[i], y: yOf(m.ayahs) }));

/** Where the curve starts: the left end of the baseline. */
const ORIGIN = { x: 40, y: BASE };
const LINE = [ORIGIN, ...PTS].map((p) => `${p.x},${p.y}`).join(" ");
/* The line already starts on the baseline, so closing it back down to the
   baseline under the last point is all the area needs. */
const AREA = `${LINE} ${PTS[PTS.length - 1].x},${BASE}`;

/* How long each beat holds, in ms. The last one is long on purpose: the
   finished chart is the thing worth reading. */
const BEATS = [900, 1700, 1700, 5200];

/** The run, split in two so each row carries different names. */
const ROW_A = RUN.slice(0, 24);
const ROW_B = RUN.slice(24);

function Row({
  items,
  reverse,
  paused,
}: {
  items: typeof RUN;
  reverse?: boolean;
  paused: boolean;
}) {
  return (
    <div className="hp-row" aria-hidden="true">
      <div
        className={`hp-track${reverse ? " hp-track-rev" : ""}`}
        data-paused={paused ? "" : undefined}
      >
        {[0, 1].map((copy) => (
          <ul key={copy}>
            {items.map((s) => (
              <li key={s.number}>
                <span>{s.en}</span>
                <span className="hp-ar" lang="ar" dir="rtl">
                  {s.ar}
                </span>
                <span className="hp-dot" />
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}

export default function HifdhProjection() {
  const reduced = usePrefersReducedMotion();
  const [override, setOverride] = useState<boolean | null>(null);
  const paused = override ?? reduced;

  // 0 = empty, 1..3 = that many points landed.
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (paused) return;
    const id = setTimeout(() => setPhase((p) => (p + 1) % 4), BEATS[phase]);
    return () => clearTimeout(id);
  }, [phase, paused]);

  // Someone who asked for less motion gets the finished chart, still. Derived
  // rather than set, so there is no flash of the empty state on the way.
  const shown = reduced && override === null ? 3 : phase;
  const current = shown === 0 ? 0 : PTS[shown - 1].ayahs;

  return (
    <div className="hp">
      <style>{CSS}</style>

      <div className="hp-head">
        <span className="hp-label">Your hifdh</span>
        <h2>
          From An-Nas to Al-Mulk:
          <br />
          <em>two juz, surah by surah.</em>
        </h2>
        <ul className="hp-checks">
          {["Tracked every week", "Revision scheduled for you", "Checked by your teacher"].map(
            (t) => (
              <li key={t}>
                <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                  <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M4.8 8.2l2.1 2.1 4.3-4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                </svg>
                {t}
              </li>
            ),
          )}
        </ul>
      </div>

      <div className="hp-stage">
        <Row items={ROW_A} paused={paused} />
        <Row items={ROW_B} reverse paused={paused} />

        <figure className="hp-card" data-phase={shown}>
          {/* The chart is drawn, but the facts are sentences: a screen reader
              gets the three milestones plainly instead of a picture of them. */}
          <figcaption className="hp-sr">
            Two juz, An-Nas to Al-Mulk.{" "}
            {MILESTONES.map((m) => `${m.label}: ${m.surahs} surahs, ${m.ayahs} ayahs.`).join(" ")}
          </figcaption>

          <svg viewBox={`0 0 ${VB.w} ${VB.h}`} className="hp-svg" aria-hidden="true">
            <line x1={ORIGIN.x} y1={BASE} x2={VB.w - 20} y2={BASE} className="hp-base" />

            <defs>
              <linearGradient id="hp-wash" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#B2C58C" stopOpacity="0.85" />
                <stop offset="1" stopColor="#B2C58C" stopOpacity="0.08" />
              </linearGradient>
            </defs>

            {/* the wash under the curve, revealed left to right with the points */}
            <clipPath id="hp-reveal">
              <rect
                x="0"
                y="0"
                height={VB.h}
                className="hp-reveal"
                width={shown === 0 ? 0 : PTS[shown - 1].x + 30}
              />
            </clipPath>
            <polygon points={AREA} className="hp-area" clipPath="url(#hp-reveal)" />
            <polyline points={LINE} className="hp-line" clipPath="url(#hp-reveal)" />

            {PTS.map((p, i) => {
              const on = shown > i;
              const last = i === PTS.length - 1;
              return (
                <g key={p.label} className="hp-pt" data-on={on ? "" : undefined}>
                  <line x1={p.x} y1={p.y} x2={p.x} y2={BASE} className="hp-tick" />
                  {last && on && !paused && (
                    <>
                      <circle cx={p.x} cy={p.y} r="12" className="hp-ring" />
                      <circle cx={p.x} cy={p.y} r="12" className="hp-ring hp-ring-2" />
                    </>
                  )}
                  <circle cx={p.x} cy={p.y} r={last ? 9 : 7} className={last ? "hp-dot-end" : "hp-dot-pt"} />
                  <text x={p.x} y={p.y - 20} className="hp-val">
                    {p.surahs} surahs
                  </text>
                  <text x={p.x} y={BASE + 30} className="hp-ms">
                    {p.label}
                  </text>
                  <text x={p.x} y={BASE + 52} className="hp-to">
                    to {p.reachedEn}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Top-left, because that is the corner a rising curve leaves empty —
              the number sits where the chart has nothing to say yet. */}
          <div className="hp-readout" aria-hidden="true">
            <span className="hp-readout-n">
              <NumberFlow value={current} willChange />
            </span>
            <span className="hp-readout-l">ayahs memorised</span>
          </div>
        </figure>
      </div>

      <button
        type="button"
        className="hp-btn"
        onClick={() => setOverride(!paused)}
        aria-pressed={paused}
      >
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          {paused ? (
            <path d="M4 2.5v11l9-5.5z" fill="currentColor" />
          ) : (
            <>
              <rect x="4" y="2.5" width="3" height="11" fill="currentColor" />
              <rect x="9.5" y="2.5" width="3" height="11" fill="currentColor" />
            </>
          )}
        </svg>
        {paused ? "Play motion" : "Pause motion"}
      </button>
    </div>
  );
}

const CSS = `
.hp { display: flex; flex-direction: column; align-items: center; gap: clamp(28px, 4vw, 44px); width: 100%; }
.hp-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

.hp-head { display: flex; flex-direction: column; align-items: center; gap: 16px; text-align: center; padding-inline: 20px; }
.hp-label { font-family: var(--font-mono); font-size: 0.75rem; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: #AAAABF; }
.hp-head h2 {
  margin: 0;
  font-family: var(--font-fraunces), Georgia, serif;
  font-weight: 300;
  font-size: clamp(2rem, 4.6vw, 3.5rem);
  line-height: 1.05;
  letter-spacing: -0.02em;
}
.hp-head em { font-style: italic; }
.hp-checks { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-wrap: wrap; justify-content: center; gap: 10px 28px; }
.hp-checks li { display: flex; align-items: center; gap: 9px; font-size: clamp(1rem, 1.4vw, 1.125rem); }
.hp-checks svg { color: #B2C58C; flex-shrink: 0; }

/* ── The stage: rows behind, card in front ───────────────────────────── */
.hp-stage { position: relative; width: 100%; display: grid; place-items: center; padding-block: 8px; }
.hp-row { position: absolute; left: 0; right: 0; overflow: hidden; pointer-events: none; }
.hp-row:nth-child(1) { top: 38%; }
.hp-row:nth-child(2) { top: 56%; }
.hp-track { display: flex; width: max-content; animation: hp-slide 70s linear infinite; }
.hp-track-rev { animation-direction: reverse; }
.hp-track[data-paused] { animation-play-state: paused; }
@keyframes hp-slide { to { transform: translateX(-50%); } }
@media (prefers-reduced-motion: reduce) { .hp-track { animation: none; } }
.hp-track ul { list-style: none; margin: 0; padding: 0; display: flex; }
.hp-track li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-right: 22px;
  white-space: nowrap;
  font-size: clamp(1.5rem, 2.6vw, 2.125rem);
  color: #AAAABF;
}
.hp-ar { font-family: var(--font-arabic); font-size: 0.7em; color: #727289; }
.hp-dot { width: 6px; height: 6px; border-radius: 50%; background: #58588A; margin-left: 10px; }

/* The card is opaque so the names disappear behind it rather than showing
   through — that occlusion is most of why the reference reads as depth. */
.hp-card {
  position: relative;
  z-index: 1;
  margin: 0;
  width: min(640px, calc(100% - 40px));
  background: #E5E5FF;
  border: 1px solid #C8C8DC;
  border-radius: 28px;
  padding: clamp(14px, 2.4vw, 22px) clamp(14px, 2.4vw, 24px) clamp(18px, 2.4vw, 26px);
  color: #00004D;
}
.hp-svg { display: block; width: 100%; height: auto; overflow: visible; }

.hp-base { stroke: #00004D; stroke-opacity: 0.18; stroke-dasharray: 4 6; }

.hp-reveal { transition: width 1000ms cubic-bezier(.22,.61,.36,1); }
.hp-area { fill: url(#hp-wash); }
.hp-line { fill: none; stroke: #00004D; stroke-opacity: 0.45; stroke-width: 1.5; }

.hp-pt { opacity: 0; transform: translateY(6px); transition: opacity 500ms ease, transform 500ms ease; }
.hp-pt[data-on] { opacity: 1; transform: none; }
.hp-tick { stroke: #00004D; stroke-opacity: 0.16; }
.hp-dot-pt { fill: #00004D; }
/* The last point is sage-600 rather than brand sage: as a meaningful graphic
   it needs 3:1 against the lavender card, and brand sage manages 1.5:1. */
.hp-dot-end { fill: #5A6A36; stroke: #E5E5FF; stroke-width: 3; }
.hp-ring { fill: none; stroke: #5A6A36; stroke-width: 1.5; transform-box: fill-box; transform-origin: center; animation: hp-pulse 2.4s ease-out infinite; }
.hp-ring-2 { animation-delay: 1.2s; }
@keyframes hp-pulse { from { transform: scale(0.8); opacity: 0.7; } to { transform: scale(2.4); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .hp-ring { display: none; } .hp-pt, .hp-reveal { transition: none; } }

.hp-svg text { text-anchor: middle; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; }
.hp-val { font-size: 17px; font-weight: 700; fill: #00004D; }
.hp-ms { font-family: var(--font-mono); font-size: 12px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; fill: #00004D; }
.hp-to { font-size: 13px; fill: #58586D; }
/* SVG text is sized in the chart's own units, so on a phone — where the whole
   600-unit canvas is drawn at ~330px — a 12-unit label lands near 6px. These
   restore the rendered size rather than redrawing the chart per breakpoint. */
@media (max-width: 560px) {
  .hp-val { font-size: 25px; }
  .hp-ms { font-size: 20px; letter-spacing: 0.08em; }
  .hp-to { font-size: 20px; }
}

.hp-readout {
  position: absolute;
  top: clamp(20px, 3.4vw, 34px);
  left: clamp(22px, 3.6vw, 38px);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.hp-readout-n { font-family: var(--font-fraunces), Georgia, serif; font-weight: 300; font-size: clamp(2.25rem, 5vw, 3.5rem); line-height: 1; letter-spacing: -0.02em; }
.hp-readout-l { font-family: var(--font-mono); font-size: 0.75rem; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #58586D; }

/* Plain text, as on the reference — a pill here looked like the page's CTA. */
.hp-btn {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 0 12px;
  background: none;
  border: 0;
  color: #E5E5FF;
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  cursor: pointer;
}
.hp-btn:focus-visible { outline: 2px solid #B2C58C; outline-offset: 3px; border-radius: 6px; }

/* On a phone the card is nearly full width, so rows running BEHIND it show
   only a word's edge either side — clipped fragments rather than a marquee.
   Here, as on the reference's phone layout, the rows come out from behind
   and run below, under the pause control: the stage dissolves
   (display: contents) so its rows and card join .hp's own column, and
   \`order\` puts them after the button. */
@media (max-width: 720px) {
  .hp-stage { display: contents; }
  .hp-card { order: 1; }
  .hp-btn { order: 2; margin-top: calc(-1 * clamp(28px, 4vw, 44px) + 8px); }
  .hp-row { order: 3; position: static; width: 100%; }
  .hp-row:nth-child(2) { margin-top: calc(-1 * clamp(28px, 4vw, 44px) + 10px); }
  .hp-track li { font-size: 1.375rem; }
}
`;
