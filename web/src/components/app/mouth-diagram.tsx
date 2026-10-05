"use client";

import { REGIONS, regionOf, type Region } from "@/lib/homework/diagram";
import { cn } from "@/lib/utils";

/**
 * The mouth and throat in section, facing left, for "tap where this sound
 * comes from". Each place a tajweed lesson names is its own shape; the ones
 * the question offers (all of them, as the loader builds it) are tappable.
 *
 * The drawing carries no labels — naming the parts would be the answer — so
 * what was picked is said in words underneath, and every shape is a radio
 * a screen reader announces by name.
 *
 * The sides of the tongue can't be seen in a side view, so they are drawn on
 * a small tongue seen from above, bottom right.
 */
const SHAPES: Record<Region, string> = {
  nose: "M44 138 C48 126 54 114 62 106 C90 98 140 98 172 106 C186 110 194 120 196 132 L196 144 L190 144 C184 138 172 133 150 131 C120 129 92 131 66 138 Z",
  lips: "M44 150 C42 156 44 160 50 162 L60 162 L60 150 Z M46 168 C44 174 46 180 54 182 L62 182 L62 168 Z",
  mouth_hollow: "M64 160 C90 140 140 132 176 140 L192 146 L190 158 C170 152 150 152 130 156 C110 158 90 166 66 172 Z",
  tongue_tip: "M66 172 C78 168 88 165 96 163 L100 190 C88 192 76 190 68 184 Z",
  tongue_middle: "M96 163 C110 159 124 156 138 155 L142 192 C128 193 114 192 100 190 Z",
  tongue_back: "M138 155 C158 153 176 156 190 160 C194 172 194 186 188 196 C172 196 156 194 142 192 Z",
  tongue_sides: "M262 236 C268 226 290 222 330 224 C336 226 338 230 336 234 C300 230 280 232 270 238 Z M262 262 C268 272 290 276 330 274 C336 272 338 268 336 264 C300 268 280 266 270 260 Z",
  throat_top: "M192 146 L212 146 L214 196 L194 196 C196 182 196 168 192 158 Z",
  throat_middle: "M194 198 L214 198 L216 244 L196 244 Z",
  throat_deep: "M196 246 L216 246 L218 296 L198 296 Z",
};

const HEAD = "M150 12 C95 12 62 38 58 78 C56 92 54 100 46 112 L28 134 C26 138 30 141 36 141 L50 142 C48 147 46 151 46 154 C46 158 50 160 54 160 L56 162 C50 165 48 169 48 173 C48 178 52 181 58 182 C56 190 58 200 66 208 C78 218 100 220 116 218 L128 226 L130 298 L236 298 C238 250 262 210 268 160 C274 90 230 12 150 12 Z";
const TONGUE_FROM_ABOVE = "M270 238 C280 232 300 230 336 234 C340 244 340 256 336 264 C300 268 280 266 270 260 C266 254 266 244 270 238 Z";

export function MouthDiagram({
  options,
  selected,
  onChange,
  readOnly = false,
  reveal = false,
}: {
  options: { position: number; label: string; correct?: boolean }[];
  /** At most one position: this is a single-answer question. */
  selected: number[];
  onChange?: (next: number[]) => void;
  readOnly?: boolean;
  /** Draw the key against the pick. Teacher-side only. */
  reveal?: boolean;
}) {
  const byRegion = new Map(
    options.flatMap((o) => {
      const r = regionOf(o.label);
      return r ? [[r, o] as const] : [];
    }),
  );
  const picked = options.find((o) => selected.includes(o.position));
  const pickedRegion = picked ? regionOf(picked.label) : null;
  const keyRegion = regionOf(options.find((o) => o.correct)?.label ?? "");

  const choose = (r: Region) => {
    const o = byRegion.get(r);
    if (!o || readOnly || !onChange) return;
    onChange(pickedRegion === r ? [] : [o.position]);
  };

  return (
    <div className="space-y-2">
      <svg
        viewBox="0 0 360 300"
        role="radiogroup"
        aria-label="Diagram of the mouth and throat"
        className="mx-auto block w-full max-w-md rounded-lg border border-line bg-page"
      >
        <path d={HEAD} className="fill-muted/40 stroke-ink" strokeWidth={2} strokeLinejoin="round" />
        {/* The teeth, for bearings. */}
        <path d="M60 152 L64 152 L64 160 M60 172 L64 172 L64 180" className="fill-none stroke-ink/50" strokeWidth={1.5} />
        <path d={TONGUE_FROM_ABOVE} className="fill-page stroke-ink" strokeWidth={1.5} />
        {(Object.keys(SHAPES) as Region[]).map((r) => {
          const offered = byRegion.has(r);
          const isPick = pickedRegion === r;
          const isKey = keyRegion === r;
          return (
            <path
              key={r}
              d={SHAPES[r]}
              role={offered ? "radio" : undefined}
              aria-checked={offered ? isPick : undefined}
              aria-label={offered ? REGIONS[r] : undefined}
              tabIndex={offered && !readOnly ? 0 : -1}
              onClick={() => choose(r)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  choose(r);
                }
              }}
              strokeWidth={1.2}
              className={cn(
                "stroke-ink/70 outline-none transition-colors",
                offered && !readOnly && "cursor-pointer hover:fill-ink/20 focus-visible:stroke-ink focus-visible:[stroke-width:2.5]",
                !reveal && (isPick ? "fill-ink/45" : "fill-background"),
                reveal && isPick && isKey && "fill-ok/55",
                reveal && isPick && !isKey && "fill-danger/50",
                reveal && !isPick && isKey && "fill-miss",
                reveal && !isPick && !isKey && "fill-background",
              )}
            />
          );
        })}
        <text x={303} y={290} textAnchor="middle" className="fill-muted-foreground text-[9px]">
          tongue, from above
        </text>
      </svg>
      <p className="text-xs text-muted-foreground">
        {reveal ? (
          <>
            {pickedRegion ? (
              <span className={pickedRegion === keyRegion ? "text-ok" : "text-danger"}>
                Picked: {REGIONS[pickedRegion]}.
              </span>
            ) : (
              <span className="text-warn">Nothing picked.</span>
            )}{" "}
            {pickedRegion !== keyRegion && keyRegion && <>Answer: {REGIONS[keyRegion]}.</>}
          </>
        ) : pickedRegion ? (
          `You picked: ${REGIONS[pickedRegion]}. Tap it again to undo.`
        ) : readOnly ? (
          "Nothing picked."
        ) : (
          "Tap a place on the drawing."
        )}
      </p>
    </div>
  );
}
