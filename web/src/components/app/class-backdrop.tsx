"use client";

import { useEffect, useRef } from "react";

/**
 * The class's own place, behind the page.
 *
 * Three of the seven classes are mosques and have a photograph. The other
 * four — Zukhruf, Hareer, Rayyan, Salsabeel — are Qur'anic names with no
 * building, so they get a geometric rosette instead. Everyone gets
 * something; nobody's screen looks like the unfinished version of someone
 * else's.
 *
 * Whatever is shown, it is drawn in ONE neutral ink and sits behind a fade
 * to the page colour. Colour never varies by class — that was a deliberate
 * decision, so a class can be added without touching the palette.
 */

const PHOTOS: Record<string, string> = {
  "masjid an-nabawi": "/brand/classes/masjid-an-nabawi.jpg",
  "masjid al-haram": "/brand/classes/masjid-al-haram.jpg",
  "masjid al-aqsa": "/brand/classes/masjid-al-aqsa.jpg",
};

/** Fold count per class, for the four that aren't buildings. */
const FOLDS: Record<string, number> = {
  zukhruf: 8,
  hareer: 12,
  rayyan: 6,
  salsabeel: 10,
};

function rosettePath(cx: number, cy: number, r: number, n: number) {
  const p: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  const step = Math.max(2, Math.round(n / 2) - 1);
  let d = "";
  for (let i = 0; i < n; i++) {
    const j = (i + step) % n;
    d += `M${p[i][0].toFixed(1)},${p[i][1].toFixed(1)}L${p[j][0].toFixed(1)},${p[j][1].toFixed(1)}`;
  }
  d += `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
  for (let i = 1; i < n; i++) d += `L${p[i][0].toFixed(1)},${p[i][1].toFixed(1)}`;
  return d + "Z";
}

function Rosettes({ fold }: { fold: number }) {
  const r = 88, dx = r * 1.74, dy = r * 1.5, W = 1400, H = 460;
  const shapes: React.ReactElement[] = [];
  let row = 0;
  for (let y = dy * 0.2; y < H + dy; y += dy, row++) {
    const off = row % 2 ? dx / 2 : 0;
    for (let x = -dx + off; x < W + dx; x += dx) {
      shapes.push(
        <path key={`p${row}-${x}`} d={rosettePath(x, y, r, fold)} />,
        <circle key={`c${row}-${x}`} cx={x} cy={y} r={r * 0.34} />,
      );
    }
  }
  return (
    <svg
      viewBox="0 0 1400 460"
      preserveAspectRatio="xMidYMax meet"
      className="backdrop-art"
      aria-hidden
    >
      <g fill="none" stroke="currentColor" strokeWidth={1.1}>{shapes}</g>
    </svg>
  );
}

export function ClassBackdrop({ className }: { className: string | null }) {
  const layer = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);

  // Parallax. Skipped entirely when the reader asks for reduced motion —
  // a drifting background is exactly what that setting is for.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (layer.current) layer.current.style.transform = `translateY(${y * 0.3}px)`;
        if (root.current) root.current.style.opacity = String(Math.max(0, 1 - y / 780));
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const key = (className ?? "").trim().toLowerCase();
  const photo = PHOTOS[key];
  const fold = FOLDS[key];
  if (!photo && !fold) return null;

  return (
    <div className="backdrop" ref={root} aria-hidden>
      <div className="backdrop-layer" ref={layer}>
        {photo ? (
          <div className="backdrop-photo" style={{ backgroundImage: `url(${photo})` }} />
        ) : (
          <Rosettes fold={fold} />
        )}
      </div>
    </div>
  );
}
