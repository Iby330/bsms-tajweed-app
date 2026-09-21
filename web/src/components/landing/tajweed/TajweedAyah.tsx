/**
 * Al-Ma'idah 5:95, walked word by word, forever.
 *
 * A ball hops along the verse. When it lands, the letters carrying a tajweed
 * rule light up in that rule's colour from the Madinah mushaf, and the entry
 * for that rule brightens in the key underneath. When the ball moves on, the
 * letters fade back. Seven sections, then it loops.
 *
 * ── What makes this one work ───────────────────────────────────────────────
 * Nothing here measures text. Every glyph is an SVG outline at a position
 * decided at build time by `scripts/bake-ayah.ts`, which shapes the Arabic
 * with the font's own GSUB/GPOS tables. That is the whole reason this exists:
 * the previous attempt measured a live text node with `Range`, which cannot
 * address a single letter, put marks in the wrong places, and depended on
 * `document.fonts.ready` and on the line never reflowing.
 *
 * So: no font loading to wait for, no ResizeObserver, no reflow, and a ball
 * whose target for word 4 is a number in a JSON file. It renders identically
 * in the Player and in a rendered MP4 because it is a pure function of the
 * frame.
 *
 * ── Non-interactive on purpose ─────────────────────────────────────────────
 * No controls, no pause, no scrub, no click targets. The visitor watches it;
 * they never operate it. Anything that looks like a control would be a lie.
 *
 * ── Colour ─────────────────────────────────────────────────────────────────
 * Navy ground, lavender verse, the eight mushaf rule colours lifted for navy
 * (see swatches.ts), sage for rules the mushaf leaves uncoloured. A rule's
 * colour carries onto the marks of its letters, because the shadda IS the
 * idgham — hiding it would hide the evidence for the rule.
 */

import { AbsoluteFill, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import baked from "@/lib/tajweed/maidah95.geometry.json";
import { MAIDAH_95 } from "@/lib/tajweed/maidah95";
import { SWATCH, SAGE, swatchFor, keyLabel } from "@/lib/tajweed/swatches";
import {
  TIMELINE,
  FPS,
  sectionAt,
  ballAt,
  ruleIntensity,
  secondsFromLanding,
  ARC,
  ARC_MIN,
  ARC_MAX,
  HANDOVER_OUT,
  HANDOVER_IN,
} from "@/lib/tajweed/timeline";
import { layoutSection, wordAnchor } from "@/lib/tajweed/layout";

const NAVY = "#00004D";
const LAVENDER = "#E5E5FF";
const LAV_MUTED = "#A8A8DC";

/* Ball and its clearance, in FONT UNITS (2048 = 1em) so they scale with the
   verse rather than with the viewport — the ball has to keep the same size
   relative to the letters in both compositions, or it reads as a different
   object on a phone. 320 units is a hair under a third of an em across, which
   is about the height of a letter's body: big enough to be the subject of the
   shot, small enough not to cover the marks it is pointing at. */
const BALL_R = 320;
/* Measured from the top of the word's HIGHEST MARK, not its letters, so even
   this small gap clears every fatha, shadda and maddah. It was 300, and at
   that the ball landed on thin air with its ripple floating on nothing; at
   150 it reads as bouncing off the word itself. */
const BALL_GAP = 150;
const HEADROOM = BALL_GAP + ARC_MAX + BALL_R * 3;

export type Variant = "desktop" | "mobile";

/**
 * Per-glyph rule colouring, computed once at module load.
 *
 * A glyph can be claimed by more than one rule — a tanween that ends one rule
 * and begins another — so each keeps its full list and the brightest live one
 * wins at render time.
 */
type GlyphPaint = { colour: string; words: number[] };
const PAINT: Array<Map<number, GlyphPaint[]>> = baked.sections.map((s, si) => {
  const meta = MAIDAH_95[si];
  const m = new Map<number, GlyphPaint[]>();
  for (const r of s.rules) {
    const rule = meta.rules.find((x) => x.id === r.id);
    if (!rule) continue;
    const sw = swatchFor(rule);
    const colour = sw ? SWATCH[sw].hex : SAGE;
    const words = [...new Set(r.g.map((gi) => s.glyphs[gi].w))];
    for (const gi of r.g) {
      const list = m.get(gi) ?? [];
      list.push({ colour, words });
      m.set(gi, list);
    }
  }
  return m;
});

/**
 * The key: EVERY rule named in the ayah, one entry per rule name, in the order
 * the ball first reaches them. It never changes — the whole set is on screen
 * from the first frame to the last, and an entry brightens while the ball is
 * on a word that rule covers.
 *
 * Each entry keeps every instance separately, per section, so it lights only
 * for that instance's own words: a Qalqalah on word 4 and another on word 6
 * light twice with the key dark on word 5, instead of staying lit across all
 * three (which is what grouping by mushaf colour used to do).
 */
type KeyEntry = { label: string; colour: string; spans: number[][][] };
const KEY: KeyEntry[] = (() => {
  const byLabel = new Map<string, KeyEntry>();
  baked.sections.forEach((s, si) => {
    const meta = MAIDAH_95[si];
    for (const r of s.rules) {
      const rule = meta.rules.find((x) => x.id === r.id);
      if (!rule) continue;
      const label = keyLabel(rule);
      const sw = swatchFor(rule);
      const entry = byLabel.get(label) ?? {
        label,
        colour: sw ? SWATCH[sw].hex : SAGE,
        spans: baked.sections.map(() => []),
      };
      entry.spans[si].push([...new Set(r.g.map((gi) => s.glyphs[gi].w))]);
      byLabel.set(label, entry);
    }
  });
  // Map insertion order is first-reached order: sections in sequence, and
  // within a section in rule order — so the key reads the way the ball moves.
  return [...byLabel.values()];
})();

/** Phone labels drop "counts" — "Madd Asli · 2" — so three fit to a row. */
const shortLabel = (label: string) => label.replace(/ counts?$/, "");

export const TajweedAyah: React.FC<{
  variant?: Variant;
  /**
   * "navy" paints the brand ground — for a rendered file, and for the preview.
   * "none" leaves it transparent, so on the landing page the hero sits on the
   * page's own tiled calligraphy instead of a flat panel covering it.
   */
  ground?: "navy" | "none";
  /**
   * The plain-English line under the verse. On by default; the landing page
   * turns it off because its own headline carries the message there, and at a
   * hero's height the gloss would crowd the key.
   */
  gloss?: boolean;
}> = ({ variant = "desktop", ground = "navy", gloss = true }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const { current, next, handover, t } = sectionAt(frame);

  const mobile = variant === "mobile";
  /* The verse never uses the full width: a hero is cropped differently at
     every aspect, and the ayah is the one thing that must survive the crop. */
  const maxTextW = width * (mobile ? 0.86 : 0.76);
  const verseY = height * (mobile ? 0.44 : 0.47);

  /* Handover progress, eased, for each half. */
  const ease = Easing.bezier(0.45, 0, 0.2, 1);
  const outP = ease(Math.min(1, handover / HANDOVER_OUT));
  const inP = ease(Math.max(0, (handover - HANDOVER_IN) / (1 - HANDOVER_IN)));

  return (
    <AbsoluteFill style={{ background: ground === "navy" ? NAVY : "transparent", overflow: "hidden" }}>
      {/* Out, then in — never both at once. A crossfade laid two
          half-transparent Arabic lines over each other for a beat, which
          reads as a smudge rather than a transition. */}
      <SectionLayer
        key={`cur-${current.section}`}
        si={current.section}
        t={t}
        opacity={1 - outP}
        lift={-outP * height * 0.035}
        maxTextW={maxTextW}
        centreY={verseY}
        mobile={mobile}
        gloss={gloss}
      />
      {inP > 0 ? (
        <SectionLayer
          key={`nxt-${next.section}`}
          si={next.section}
          t={next.start}
          opacity={inP}
          lift={(1 - inP) * height * 0.035}
          maxTextW={maxTextW}
          centreY={verseY}
          mobile={mobile}
          gloss={gloss}
        />
      ) : null}

      {/* One key for the whole piece. It does not fade with the sections —
          only its highlights change — so the set of rules is always there to
          read. Without the gloss it rises toward the verse it explains. */}
      <Key
        si={current.section}
        t={t}
        width={width}
        height={height}
        mobile={mobile}
        lift={gloss ? 0 : mobile ? 0 : 0.05}
      />
    </AbsoluteFill>
  );
};

const SectionLayer: React.FC<{
  si: number;
  t: number;
  opacity: number;
  lift: number;
  maxTextW: number;
  centreY: number;
  mobile: boolean;
  gloss: boolean;
}> = ({ si, t, opacity, lift, maxTextW, centreY, mobile, gloss }) => {
  const s = baked.sections[si];
  const beat = TIMELINE.sections[si];

  /* One line on desktop; on a phone, wrapped so the em stays readable. */
  const layout = layoutSection(si, mobile ? 8.6 : Infinity);

  const vbX = -baked.unitsPerEm * 0.3;
  const vbW = layout.width + baked.unitsPerEm * 0.6;
  const vbTop = s.top + HEADROOM;
  const vbBottom = s.bottom - layout.lineHeight * (layout.lines.length - 1) - baked.unitsPerEm * 0.25;
  const vbH = vbTop - vbBottom;

  /* Fit by width, but never let a short section (عَفَا ٱللَّهُ عَمَّا سَلَفَ is
     four words) grow so tall that the ball's headroom pushes it off screen.
     Capping the em size also stops the four-word sections from towering over
     the eleven-word ones, which would make the loop pulse in size. */
  const maxEm = mobile ? 132 : 150;
  const pxW = Math.min(maxTextW, (layout.width / baked.unitsPerEm) * maxEm);
  const pxH = (vbH / vbW) * pxW;

  /* ── The ball ─────────────────────────────────────────────────────────
     Real projectile motion: CONSTANT horizontal speed and a PARABOLIC height,
     so it moves fastest at contact and hangs briefly at the top, which is
     what reads as gravity. Everything below is in font units, y up. */
  const ball = ballAt(beat, t);
  /** Where the ball's underside meets a word: a clear gap above its ink, so
      it never covers the marks it is pointing at. */
  const contactY = (w: number) => wordAnchor(si, layout, w).top + BALL_GAP;

  let bx = 0;
  let bottom = 0; // height of the ball's underside
  let vx = 0; // velocity, per unit of the phase's progress
  let vy = 0;
  let ballOpacity = 1;
  let arcH = ARC_MAX;

  if (ball.phase === "hop") {
    const a = wordAnchor(si, layout, ball.from);
    const b = wordAnchor(si, layout, ball.to);
    const pr = ball.p;
    /* A hop that crosses a line break is a carriage return, not a bounce:
       the ball leaps clear and dips out while it travels, then comes down on
       the first word of the next line. Only in the wrapped (mobile) layout. */
    const wraps = a.line !== b.line;
    const span = Math.abs(b.x - a.x);
    arcH = wraps
      ? layout.lineHeight * 0.85 + ARC_MAX
      : Math.min(ARC_MAX, Math.max(ARC_MIN, span * ARC));
    const y0 = contactY(ball.from);
    const y1 = contactY(ball.to);
    bx = a.x + (b.x - a.x) * pr;
    bottom = y0 + (y1 - y0) * pr + 4 * arcH * pr * (1 - pr);
    vx = b.x - a.x;
    vy = y1 - y0 + 4 * arcH * (1 - 2 * pr);
    if (wraps) ballOpacity = 1 - 0.85 * Math.sin(Math.PI * pr);
  } else if (ball.phase === "drop") {
    /* Falls under gravity — accelerating, as a dropped thing does. The first
       version eased the other way, so it looked lowered on a string. */
    const w = wordAnchor(si, layout, ball.word);
    const fall = HEADROOM * 0.72;
    bx = w.x;
    bottom = contactY(ball.word) + fall * (1 - ball.p * ball.p);
    vy = -2 * fall * ball.p;
    ballOpacity = Math.min(1, ball.p / 0.3);
  } else {
    /* Rebounds off the last word and carries on in the reading direction,
       rising and fading, instead of vanishing on the spot. */
    const w = wordAnchor(si, layout, ball.word);
    const up = ARC_MAX * 0.95;
    const drift = -baked.unitsPerEm * 0.9; // leftwards: the way Arabic reads on
    const q = ball.p;
    bx = w.x + drift * q;
    bottom = contactY(ball.word) + up * (1 - (1 - q) * (1 - q));
    vx = drift;
    vy = 2 * up * (1 - q);
    ballOpacity = 1 - Math.pow(q, 1.4);
  }

  /* Squash at contact, stretch in flight, round at the top of the arc.
     The first version had this backwards — flattened at the apex, perfectly
     round at the moment it hit — which is most of why it felt stiff. */
  const dt = secondsFromLanding(beat, t);
  const cLin = Math.max(0, 1 - Math.abs(dt) / 0.075);
  const contact = cLin * cLin * (3 - 2 * cLin); // smoothstep
  const squashY = 1 - 0.24 * contact;
  const squashX = 1 + 0.2 * contact;
  const speed = Math.min(1, Math.abs(vy) / (4 * ARC_MAX));
  const stretch = 1 + 0.17 * speed * (1 - contact);
  /* SVG y points down, so the screen-space velocity is (vx, -vy). */
  const angle = (Math.atan2(-vy, vx || 1e-6) * 180) / Math.PI;
  /* Keep the underside planted while squashed, so the ball flattens INTO
     the contact rather than shrinking around its middle. */
  const by = bottom + BALL_R * squashY;

  /* A ripple where it lands: the one cue that says "this word, now". */
  let ripple: { x: number; y: number; k: number } | null = null;
  {
    const landed = [...beat.beats].reverse().find((b) => b.land <= t);
    if (landed) {
      const age = (t - landed.land) / FPS;
      if (age < 0.45) {
        const k = 1 - Math.pow(1 - age / 0.45, 3); // ease-out
        ripple = { x: wordAnchor(si, layout, landed.word).x, y: contactY(landed.word), k };
      }
    }
  }

  const paint = PAINT[si];
  /* Per-word line offsets, looked up once per glyph. */
  const dxOf = (w: number) => layout.lines[layout.lineOfWord[w]].dx;
  const dyOf = (w: number) => layout.lines[layout.lineOfWord[w]].dy;

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "flex-start",
        paddingTop: centreY - pxH * 0.62,
        opacity,
        transform: `translateY(${lift}px)`,
      }}
    >
      <svg
        viewBox={`${vbX} ${-vbTop} ${vbW} ${vbH}`}
        width={pxW}
        height={pxH}
        style={{ display: "block", overflow: "visible" }}
      >
        {/* Base verse. Always drawn; a whole line moves as one rigid body, so
            no glyph ever shifts relative to its neighbours. */}
        {s.glyphs.map((g, gi) => (
          <g
            key={`b${gi}`}
            transform={`translate(${g.x + dxOf(g.w)} ${-g.y + dyOf(g.w)}) scale(1 -1)`}
          >
            <path d={baked.outlines[g.o]} fill={LAVENDER} />
          </g>
        ))}

        {/* Lit copies on top. Same outline, same place — only the fill and its
            opacity change, so a letter can never shift as it lights. */}
        {s.glyphs.map((g, gi) => {
          const rules = paint.get(gi);
          if (!rules) return null;
          let best: GlyphPaint | null = null;
          let bestI = 0;
          for (const r of rules) {
            const i = ruleIntensity(beat, t, r.words);
            if (i > bestI) {
              bestI = i;
              best = r;
            }
          }
          if (!best || bestI <= 0.001) return null;
          return (
            <g
              key={`l${gi}`}
              transform={`translate(${g.x + dxOf(g.w)} ${-g.y + dyOf(g.w)}) scale(1 -1)`}
              opacity={bestI}
            >
              <path d={baked.outlines[g.o]} fill={best.colour} />
            </g>
          );
        })}

        {/* The ripple, drawn under the ball. */}
        {ripple ? (
          <ellipse
            cx={ripple.x}
            cy={-ripple.y}
            rx={BALL_R * (0.9 + 2.1 * ripple.k)}
            ry={BALL_R * (0.28 + 0.34 * ripple.k)}
            fill="none"
            stroke={SAGE}
            strokeWidth={BALL_R * (0.16 - 0.12 * ripple.k)}
            opacity={0.45 * (1 - ripple.k) * ballOpacity}
          />
        ) : null}

        {/* The ball. Squash is applied in screen axes AFTER the stretch is
            rotated onto the direction of travel, so the two compose. */}
        <g opacity={ballOpacity}>
          <circle cx={bx} cy={-by} r={BALL_R * 2.2} fill={SAGE} opacity={0.09} />
          <g transform={`translate(${bx} ${-by}) scale(${squashX} ${squashY}) rotate(${angle})`}>
            <ellipse cx={0} cy={0} rx={BALL_R * stretch} ry={BALL_R / stretch} fill={SAGE} />
          </g>
        </g>
      </svg>

      {gloss ? <Gloss si={si} mobile={mobile} /> : null}
    </AbsoluteFill>
  );
};

const Gloss: React.FC<{ si: number; mobile: boolean }> = ({ si, mobile }) => (
  <p
    style={{
      color: LAV_MUTED,
      font: `${mobile ? 30 : 34}px/1.5 -apple-system, system-ui, sans-serif`,
      maxWidth: mobile ? "82%" : "56%",
      textAlign: "center",
      margin: `${mobile ? 64 : 72}px 0 0`,
    }}
  >
    {MAIDAH_95[si].english}
  </p>
);

/**
 * All sixteen rules, dimmed, the live one bright.
 *
 * Laid out as centred rows that WRAP, not a grid: the labels run from "Iqlab"
 * to "Madd Muttasil · 4 counts", and a grid sizes every column to its widest
 * label, which wastes a row or two. Nothing reflows while it plays — the list
 * is fixed and lighting an entry changes only colour and a transform.
 */
const Key: React.FC<{
  si: number;
  t: number;
  width: number;
  height: number;
  mobile: boolean;
  lift: number;
}> = ({ si, t, width, height, mobile, lift }) => {
  const beat = TIMELINE.sections[si];
  /* Sized for the SCALED result, not the composition: the phone composition
     is 1080 wide and lands at roughly 375–430 CSS px, so 33 here is ~12px. */
  const font = mobile ? 33 : 24;
  const dot = mobile ? 22 : 18;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: height * ((mobile ? 0.06 : 0.07) + lift),
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        columnGap: mobile ? 34 : 40,
        rowGap: mobile ? 14 : 12,
        padding: `0 ${width * (mobile ? 0.05 : 0.09)}px`,
      }}
    >
      {KEY.map((e) => {
        let on = 0;
        for (const words of e.spans[si]) on = Math.max(on, ruleIntensity(beat, t, words));
        return (
          <div
            key={e.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: mobile ? 9 : 12,
              opacity: 0.32 + on * 0.68,
            }}
          >
            <span
              style={{
                width: dot,
                height: dot,
                borderRadius: "50%",
                background: e.colour,
                flex: "none",
                transform: `scale(${1 + on * 0.3})`,
              }}
            />
            <span
              style={{
                color: on > 0.5 ? LAVENDER : LAV_MUTED,
                font: `${font}px/1.2 -apple-system, system-ui, sans-serif`,
                whiteSpace: "nowrap",
              }}
            >
              {mobile ? shortLabel(e.label) : e.label}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default TajweedAyah;
