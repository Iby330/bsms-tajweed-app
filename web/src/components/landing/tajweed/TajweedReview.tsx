"use client";

/**
 * A review desk for the hero: every word, every rule on it, and exactly when
 * it lights — with the real animation beside it, slowed down and steppable.
 *
 * The hero itself runs at full speed and has no controls, which is right for a
 * visitor and useless for checking. This page is the opposite on purpose: a
 * scrubber, ¼ and ½ speed, a jump to every landing, and a table a teacher can
 * read row by row. Everything here comes from the same data and the same
 * timeline functions the hero runs on — nothing is restated — so what it shows
 * is what visitors see.
 */

import { Player, type PlayerRef } from "@remotion/player";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TajweedAyah } from "./TajweedAyah";
import baked from "@/lib/tajweed/maidah95.geometry.json";
import { MAIDAH_95, type Rule } from "@/lib/tajweed/maidah95";
import { LETTERS } from "@/lib/tajweed/maidah95.letters";
import { SWATCH, SAGE, swatchFor, keyLabel } from "@/lib/tajweed/swatches";
import { TIMELINE, FPS, ruleWindow } from "@/lib/tajweed/timeline";

const NAVY = "#00004D";
const LAVENDER = "#E5E5FF";
const MUTED = "#A8A8DC";
const RULE_LINE = "#1E397A";

/** Every word's landing, in order, as absolute frames — the steps for ← and →. */
const STOPS = TIMELINE.sections.flatMap((sec) =>
  sec.beats.map((b) => ({ si: sec.section, w: b.word, frame: b.land })),
);

const secs = (f: number) => (f / FPS).toFixed(2);

/** Frames after touchdown to park on: the rule is fully lit by then. */
const PARK = Math.round(FPS * 0.08);

type RuleRow = {
  rule: Rule;
  glyphs: number[];
  words: number[];
  colour: string;
  colourName: string;
  window: NonNullable<ReturnType<typeof ruleWindow>>;
};

/** Rules for each section, with everything the table needs worked out once. */
const SECTION_RULES: RuleRow[][] = baked.sections.map((s, si) => {
  const meta = MAIDAH_95[si];
  const beat = TIMELINE.sections[si];
  return s.rules.flatMap((r) => {
    const rule = meta.rules.find((x) => x.id === r.id);
    if (!rule) return [];
    const words = [...new Set(r.g.map((gi) => s.glyphs[gi].w))].sort((a, b) => a - b);
    const sw = swatchFor(rule);
    const window = ruleWindow(beat, words);
    if (!window) return [];
    return [
      {
        rule,
        glyphs: r.g,
        words,
        colour: sw ? SWATCH[sw].hex : SAGE,
        colourName: sw ? SWATCH[sw].en : "No mushaf colour (sage)",
        window,
      },
    ];
  });
});

export default function TajweedReview() {
  const player = useRef<PlayerRef>(null);
  const [frame, setFrame] = useState(0);
  const [rate, setRate] = useState(0.5);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const p = player.current;
    if (!p) return;
    const onFrame = (e: { detail: { frame: number } }) => setFrame(e.detail.frame);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    p.addEventListener("frameupdate", onFrame);
    p.addEventListener("play", onPlay);
    p.addEventListener("pause", onPause);
    return () => {
      p.removeEventListener("frameupdate", onFrame);
      p.removeEventListener("play", onPlay);
      p.removeEventListener("pause", onPause);
    };
  }, []);

  /** Where the playhead is, in section terms. */
  const here = useMemo(() => {
    // A section owns its span from its start until the next one starts, so
    // the handover counts as the outgoing section.
    const sec =
      [...TIMELINE.sections].reverse().find((s) => frame >= s.start) ?? TIMELINE.sections[0];
    const landed = [...sec.beats].reverse().find((b) => b.land <= frame);
    return { si: sec.section, w: landed ? landed.word : -1 };
  }, [frame]);

  const seek = useCallback((f: number) => {
    const p = player.current;
    if (!p) return;
    p.pause();
    p.seekTo(Math.max(0, Math.min(TIMELINE.durationInFrames - 1, Math.round(f))));
  }, []);

  const step = useCallback(
    (dir: 1 | -1) => {
      const cur = player.current?.getCurrentFrame() ?? frame;
      // Each stop is parked a few frames AFTER touchdown, when the rule is
      // fully lit — so compare against that parked frame, or "previous" keeps
      // finding the word it is already sitting on.
      const parked = (f: number) => f + PARK;
      const target =
        dir === 1
          ? STOPS.find((s) => parked(s.frame) > cur + 1)
          : [...STOPS].reverse().find((s) => parked(s.frame) < cur - 1);
      if (target) seek(parked(target.frame));
    },
    [frame, seek],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input,select,textarea")) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        step(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        step(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  const totalRules = SECTION_RULES.reduce((n, r) => n + r.length, 0);

  return (
    <main style={page}>
      <header style={{ maxWidth: 1180, margin: "0 auto 18px" }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 4px" }}>
          Hero review: Al-Ma&apos;idah 5:95
        </h1>
        <p style={{ color: MUTED, margin: 0, fontSize: 13, lineHeight: 1.5 }}>
          {baked.sections.length} sections · {STOPS.length} words · {totalRules} rules ·{" "}
          {(TIMELINE.durationInFrames / FPS).toFixed(1)}s loop at {FPS}fps. Click any word to
          jump there. ← → step word by word.
        </p>
      </header>

      {/* The real composition, with controls — this page is for checking. */}
      <section style={{ position: "sticky", top: 0, zIndex: 5, background: NAVY, paddingBottom: 10 }}>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <div style={{ border: `1px solid ${RULE_LINE}`, borderRadius: 8, overflow: "hidden" }}>
            <Player
              ref={player}
              component={TajweedAyah}
              inputProps={{ variant: "desktop" as const }}
              durationInFrames={TIMELINE.durationInFrames}
              fps={FPS}
              compositionWidth={2560}
              compositionHeight={1440}
              controls
              loop
              playbackRate={rate}
              initiallyMuted
              numberOfSharedAudioTags={0}
              acknowledgeRemotionLicense
              style={{ width: "100%", aspectRatio: "16 / 9", maxHeight: "44vh" }}
            />
          </div>

          <div style={bar}>
            <button style={btn} onClick={() => step(-1)} aria-label="Previous word">
              ← Previous word
            </button>
            <button
              style={{ ...btn, background: LAVENDER, color: NAVY, minWidth: 84 }}
              onClick={() => (playing ? player.current?.pause() : player.current?.play())}
            >
              {playing ? "Pause" : "Play"}
            </button>
            <button style={btn} onClick={() => step(1)} aria-label="Next word">
              Next word →
            </button>
            <span style={{ color: MUTED, marginLeft: 8 }}>Speed</span>
            {[0.25, 0.5, 1].map((r) => (
              <button
                key={r}
                style={{ ...btn, ...(rate === r ? { background: SAGE, color: NAVY, borderColor: SAGE } : {}) }}
                onClick={() => setRate(r)}
              >
                {r === 1 ? "1×" : r === 0.5 ? "½×" : "¼×"}
              </button>
            ))}
            <span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums", color: MUTED }}>
              {secs(frame)}s · frame {frame} · section {here.si + 1}
              {here.w >= 0 ? ` · word ${here.w + 1}` : ""}
            </span>
          </div>
        </div>
      </section>

      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        {baked.sections.map((s, si) => {
          const beat = TIMELINE.sections[si];
          const rows = SECTION_RULES[si];
          return (
            <section key={s.id} style={{ marginTop: 26 }}>
              <h2 style={h2}>
                Section {si + 1}
                <span style={{ color: MUTED, fontWeight: 400 }}>
                  {" "}
                  · on screen {secs(beat.start)}s – {secs(beat.end)}s ·{" "}
                </span>
                <span dir="rtl" lang="ar" style={arInline}>
                  {s.text}
                </span>
              </h2>

              <table style={table}>
                <thead>
                  <tr>
                    <th style={{ ...th, width: 40 }}>#</th>
                    <th style={{ ...th, width: 150 }}>Word</th>
                    <th style={{ ...th, width: 118 }}>Ball lands</th>
                    <th style={th}>Rules on this word</th>
                  </tr>
                </thead>
                <tbody>
                  {s.words.map((word, wi) => {
                    const land = beat.beats[wi].land;
                    const onThis = rows.filter((r) => r.words.includes(wi));
                    const active = here.si === si && here.w === wi;
                    return (
                      <tr
                        key={wi}
                        onClick={() => seek(land + PARK)}
                        style={{
                          cursor: "pointer",
                          background: active ? "rgba(178,197,140,0.14)" : undefined,
                          outline: active ? `1px solid ${SAGE}` : undefined,
                        }}
                      >
                        <td style={{ ...td, color: MUTED }}>{wi + 1}</td>
                        <td style={td}>
                          <WordArt si={si} w={wi} />
                        </td>
                        <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>
                          {secs(land)}s
                          <div style={{ color: MUTED, fontSize: 11 }}>frame {land}</div>
                        </td>
                        <td style={td}>
                          {onThis.length === 0 ? (
                            <span style={{ color: MUTED }}>No rule: the ball passes over</span>
                          ) : (
                            onThis.map((r) => (
                              <RuleLine key={r.rule.id} row={r} si={si} w={wi} />
                            ))
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          );
        })}
        <p style={{ color: MUTED, fontSize: 12, margin: "28px 0 60px", lineHeight: 1.6 }}>
          Timing key: <b>lit</b> is when the colour is fully on: the ball&apos;s landing. It
          starts rising a fraction of a second before touchdown, begins to <b>fade</b> just
          before the next landing, and is <b>gone</b> the moment the ball lands on the next word. A rule that
          spans two words is lit across both and shows under each. Source of truth: the rule
          names are in <code>maidah95.ts</code>, the exact letters in{" "}
          <code>maidah95.letters.ts</code>.
        </p>
      </div>
    </main>
  );
}

/** One rule on one word: the word drawn with ONLY this rule's letters lit. */
function RuleLine({ row, si, w }: { row: RuleRow; si: number; w: number }) {
  const { rule, colour, colourName, window, words, glyphs } = row;
  const letters = LETTERS[rule.id];
  const spansWords = words.length > 1;
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "center", padding: "6px 0" }}>
      <div style={{ width: 120, flex: "none" }}>
        <WordArt si={si} w={w} lit={glyphs} colour={colour} />
      </div>
      <div style={{ flex: 1, minWidth: 0, lineHeight: 1.45 }}>
        <div>
          <span style={{ ...chip, background: colour }} />
          <b>{rule.name}</b>{" "}
          <span dir="rtl" lang="ar" style={{ ...arInline, color: MUTED }}>
            {rule.arabic}
          </span>
          {rule.counts ? <span style={{ color: MUTED }}> · {rule.counts}</span> : null}
          {rule.condition ? (
            <span style={{ color: SAGE }}> · only {rule.condition}</span>
          ) : null}
        </div>
        <div style={{ color: MUTED, fontSize: 12 }}>
          key: <span style={{ color: LAVENDER }}>{keyLabel(rule)}</span> · {colourName}
          {letters ? (
            <>
              {" "}
              · letters{" "}
              <span dir="rtl" lang="ar" style={arInline}>
                {letters.map((l) => l.t).join(" + ")}
              </span>
            </>
          ) : null}
          {spansWords ? ` · spans words ${words.map((x) => x + 1).join("–")}` : null}
        </div>
        <div style={{ color: MUTED, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
          lit {secs(window.on)}s → fades {secs(window.fade)}s · gone {secs(window.off)}s
        </div>
      </div>
    </div>
  );
}

/** A single word from the baked geometry, optionally with some glyphs lit. */
function WordArt({ si, w, lit, colour }: { si: number; w: number; lit?: number[]; colour?: string }) {
  const s = baked.sections[si];
  const word = s.words[w];
  const pad = baked.unitsPerEm * 0.12;
  const x0 = word.x0 - pad;
  const x1 = word.x1 + pad;
  const top = word.top + pad;
  const bottom = s.bottom - pad;
  const litSet = lit ? new Set(lit) : null;
  return (
    <svg
      viewBox={`${x0} ${-top} ${x1 - x0} ${top - bottom}`}
      style={{ display: "block", height: 44, width: "100%" }}
      preserveAspectRatio="xMidYMid meet"
      aria-label={word.text}
    >
      {word.g.map((gi) => {
        const g = s.glyphs[gi];
        return (
          <g key={gi} transform={`translate(${g.x} ${-g.y}) scale(1 -1)`}>
            <path
              d={baked.outlines[g.o]}
              fill={litSet?.has(gi) ? colour : litSet ? "rgba(229,229,255,0.55)" : LAVENDER}
            />
          </g>
        );
      })}
    </svg>
  );
}

/* ── styles ─────────────────────────────────────────────────────────────── */

const page: React.CSSProperties = {
  background: NAVY,
  color: LAVENDER,
  minHeight: "100dvh",
  padding: "24px 20px",
  font: "14px/1.4 -apple-system, system-ui, sans-serif",
};
const bar: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
  marginTop: 10,
  fontSize: 13,
};
const btn: React.CSSProperties = {
  font: "inherit",
  color: LAVENDER,
  background: "transparent",
  border: `1px solid ${RULE_LINE}`,
  borderRadius: 999,
  padding: "6px 14px",
  cursor: "pointer",
};
const h2: React.CSSProperties = { fontSize: 15, fontWeight: 600, margin: "0 0 8px" };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse" };
const th: React.CSSProperties = {
  textAlign: "left",
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.04em",
  color: MUTED,
  padding: "6px 8px",
  borderBottom: `1px solid ${RULE_LINE}`,
};
const td: React.CSSProperties = {
  padding: "8px",
  borderBottom: `1px solid ${RULE_LINE}`,
  verticalAlign: "middle",
};
const chip: React.CSSProperties = {
  display: "inline-block",
  width: 10,
  height: 10,
  borderRadius: "50%",
  marginRight: 7,
  verticalAlign: 0,
};
const arInline: React.CSSProperties = {
  fontFamily: '"Uthmanic Hafs", serif',
  fontSize: "1.2em",
};
