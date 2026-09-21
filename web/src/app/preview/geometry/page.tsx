import type { Metadata } from "next";
import baked from "@/lib/tajweed/maidah95.geometry.json";
import { MAIDAH_95 } from "@/lib/tajweed/maidah95";
import { SWATCH, SAGE, swatchFor, type SwatchKey } from "@/lib/tajweed/swatches";
import { LETTERS } from "@/lib/tajweed/maidah95.letters";

/**
 * The baked glyph geometry, drawn flat, so the shaping can be checked by eye
 * before any animation is built on top of it.
 *
 * This is a proof, not a component, and it is deliberately ugly. It answers
 * three questions and no others:
 *
 *   1. Do the letters JOIN, and do the marks sit where the font's anchors put
 *      them? This is the thing the old Range-measuring hero could not get
 *      right, and the reason the geometry is baked at all.
 *   2. Does each rule light the LETTERS it names rather than the word around
 *      them? The colour here is the same `swatchFor` mapping the hero uses.
 *   3. Do the word boxes — which become the ball's landing targets — actually
 *      sit over the ink?
 *
 * If a teacher is reviewing the rule marking, this is the page to sit them in
 * front of: every rule is listed under the section it belongs to, with the
 * exact letters it covers and the mushaf colour it paints.
 */

export const metadata: Metadata = {
  title: "Geometry proof",
  robots: { index: false, follow: false },
};

const LAVENDER = "#E5E5FF";
const upem = baked.unitsPerEm;

export default function GeometryProofPage() {
  const glyphTotal = baked.sections.reduce((n, s) => n + s.glyphs.length, 0);
  const ruleTotal = baked.sections.reduce((n, s) => n + s.rules.length, 0);

  return (
    <main
      style={{
        background: "#00004D",
        color: LAVENDER,
        minHeight: "100dvh",
        padding: 32,
        font: "14px/1.5 -apple-system, system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 4px" }}>
        Baked geometry — Al-Ma&apos;idah 5:95
      </h1>
      <p style={{ opacity: 0.65, margin: "0 0 20px" }}>
        {baked.sections.length} sections · {glyphTotal} glyphs · {ruleTotal} rules ·{" "}
        {baked.font}
        <br />
        Sage dashes are the ball&apos;s landing boxes. Coloured glyphs are what each rule
        lights.
      </p>

      <MarkStackingCheck />

      <ul
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 6,
          listStyle: "none",
          padding: 0,
          margin: "0 0 28px",
          fontSize: 12,
        }}
      >
        {(Object.keys(SWATCH) as SwatchKey[]).map((k) => (
          <li key={k}>
            <Chip colour={SWATCH[k].hex} />
            {SWATCH[k].en}{" "}
            <span style={{ opacity: 0.5, fontVariantNumeric: "tabular-nums" }}>
              {SWATCH[k].hex} · {SWATCH[k].onNavy.toFixed(2)}:1
            </span>
          </li>
        ))}
        <li>
          <Chip colour={SAGE} />
          not coloured by the mushaf — sage accent
        </li>
      </ul>

      {baked.sections.map((s, si) => {
        const meta = MAIDAH_95[si];
        const pad = upem * 0.35;

        // Colour each glyph by the first rule that claims it. Overlaps are
        // real (a letter can carry two rules) and the hero resolves them in
        // time; here first-wins is enough to see the spans land correctly.
        const colourOf = new Map<number, string>();
        for (const r of s.rules) {
          const rule = meta.rules.find((x) => x.id === r.id);
          if (!rule) continue;
          const sw = swatchFor(rule);
          const hex = sw ? SWATCH[sw].hex : SAGE;
          for (const gi of r.g) if (!colourOf.has(gi)) colourOf.set(gi, hex);
        }

        return (
          <section
            key={s.id}
            style={{ margin: "0 0 36px", borderTop: "1px solid #1E397A", paddingTop: 18 }}
          >
            <h2
              style={{
                fontSize: 12,
                fontWeight: 600,
                opacity: 0.7,
                margin: "0 0 10px",
                letterSpacing: "0.04em",
              }}
            >
              {s.id} · {s.words.length} words · {s.glyphs.length} glyphs
            </h2>

            <svg
              viewBox={`${-pad} ${-(s.top + pad)} ${s.width + pad * 2} ${
                s.top - s.bottom + pad * 2
              }`}
              preserveAspectRatio="xMidYMid meet"
              style={{ display: "block", width: "100%", height: "auto", maxHeight: 190 }}
            >
              {s.glyphs.map((g, gi) => (
                <g key={gi} transform={`translate(${g.x} ${-g.y}) scale(1 -1)`}>
                  <path d={baked.outlines[g.o]} fill={colourOf.get(gi) ?? LAVENDER} />
                </g>
              ))}
              {s.words.map((w) => (
                <g key={w.i}>
                  <rect
                    x={w.x0}
                    y={-w.top}
                    width={w.x1 - w.x0}
                    height={w.top - s.bottom}
                    fill="none"
                    stroke={SAGE}
                    strokeWidth={6}
                    strokeDasharray="18 14"
                    opacity={0.45}
                  />
                  <circle cx={(w.x0 + w.x1) / 2} cy={-w.top - 95} r={34} fill={SAGE} />
                </g>
              ))}
            </svg>

            <ul
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                gap: 6,
                listStyle: "none",
                padding: 0,
                margin: "12px 0 0",
                fontSize: 12,
              }}
            >
              {s.rules.map((r) => {
                const rule = meta.rules.find((x) => x.id === r.id);
                if (!rule) return null;
                const sw = swatchFor(rule);
                const letters = LETTERS[r.id];
                return (
                  <li key={r.id} style={{ opacity: 0.9 }}>
                    <Chip colour={sw ? SWATCH[sw].hex : SAGE} />
                    <b>{rule.name}</b>{" "}
                    <span style={{ opacity: 0.6 }}>
                      {r.g.length} glyph{r.g.length === 1 ? "" : "s"}
                    </span>
                    <br />
                    <span style={{ opacity: 0.6, paddingLeft: 18 }}>
                      {letters ? (
                        <>
                          letters{" "}
                          <span style={{ fontSize: "1.2em" }}>
                            {letters.map((l) => l.t).join(" + ")}
                          </span>
                        </>
                      ) : (
                        <i>whole-word span — not yet narrowed to letters</i>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </main>
  );
}

/**
 * Our baked glyphs against the browser's own rendering of the same word, in
 * the same font, at the same size.
 *
 * This is a differential test, and it exists because "the marks look wrong" has
 * two completely different causes that look identical on screen:
 *
 *   · WE dropped positioning — the baker ignored a mark-to-mark attachment, so
 *     a damma sits ON a shadda instead of above it. Our bug, and fixable here.
 *   · The FONT stacks them that tightly, and the browser does exactly the same.
 *     Then there is nothing to fix in the baker, and the answer is optical —
 *     more size, or letting the lit colour do the separating.
 *
 * Uthmani script legitimately stacks a shadda and its vowel, so tightness
 * alone proves nothing. Only the comparison does. If the two rows below differ
 * in the RELATIVE placement of any mark, the baker is wrong. If they match,
 * the baker is faithful and any remaining complaint is about type size.
 */
const STACK_CHECKS: Array<{ s: number; w: number; note: string }> = [
  { s: 0, w: 0, note: "fatha on ya, then dagger alif + maddah" },
  { s: 0, w: 1, note: "shadda + fatha on the lam" },
  { s: 0, w: 5, note: "shadda on sad, sukun on ya" },
  { s: 1, w: 3, note: "shadda + fatha, twice" },
  { s: 4, w: 1, note: "shadda + fatha on the lam of Allah" },
];

function MarkStackingCheck() {
  return (
    <section
      style={{
        border: "1px solid #1E397A",
        borderRadius: 8,
        padding: "16px 18px",
        margin: "0 0 28px",
      }}
    >
      <h2 style={{ fontSize: 13, fontWeight: 600, margin: "0 0 2px" }}>
        Mark stacking — baked glyphs vs the browser&apos;s own rendering
      </h2>
      <p style={{ opacity: 0.6, fontSize: 12, margin: "0 0 14px" }}>
        Same word, same font, same size. Top row is ours (SVG paths positioned by the
        baker). Bottom row is the browser shaping the text itself. Any difference in
        where a mark sits is a bug in the baker.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${STACK_CHECKS.length}, 1fr)`,
          gap: 14,
        }}
      >
        {STACK_CHECKS.map(({ s, w, note }) => {
          const sec = baked.sections[s];
          const word = sec.words[w];
          const pad = upem * 0.18;
          const gs = word.g;
          const x0 = word.x0 - pad;
          const x1 = word.x1 + pad;
          const top = word.top + pad;
          const bottom = sec.bottom - pad;

          return (
            <div key={`${s}-${w}`} style={{ textAlign: "center" }}>
              <svg
                viewBox={`${x0} ${-top} ${x1 - x0} ${top - bottom}`}
                preserveAspectRatio="xMidYMid meet"
                style={{ display: "block", width: "100%", height: 120 }}
              >
                {gs.map((gi) => {
                  const g = sec.glyphs[gi];
                  return (
                    <g key={gi} transform={`translate(${g.x} ${-g.y}) scale(1 -1)`}>
                      <path d={baked.outlines[g.o]} fill={LAVENDER} />
                    </g>
                  );
                })}
              </svg>

              <div
                dir="rtl"
                lang="ar"
                style={{
                  fontFamily: '"Uthmanic Hafs", serif',
                  fontSize: 64,
                  lineHeight: 1.9,
                  color: "#B2C58C",
                  height: 120,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                {word.text}
              </div>

              <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>{note}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Chip({ colour }: { colour: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 11,
        height: 11,
        borderRadius: "50%",
        background: colour,
        marginRight: 7,
        verticalAlign: -1,
      }}
    />
  );
}
