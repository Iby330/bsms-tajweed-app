"use client";

import { useEffect, useState, type CSSProperties } from "react";

export type RailItem = { id: string; label: string };

/**
 * The page's progress, as a line of dots down the right-hand edge.
 *
 * It replaced scroll snapping as the "where am I" signal. Snapping told a
 * reader they had arrived somewhere by parking them there, which felt
 * magnetic; this tells them without taking the scroll away. The line fills
 * with sage as they go, the current section's dot is lit, and each dot is a
 * link to its section (a hover label names it on a desktop).
 *
 * It stays hidden on the hero: screen one is the verse and the headline, and
 * a progress bar at 0% says nothing there.
 *
 * A section counts as current once it crosses the middle of the viewport —
 * the observer's root is a one-pixel band across the centre — so a tall
 * section stays current for as long as it fills the reader's eye line.
 */
export default function SectionRail({ items }: { items: readonly RailItem[] }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const els = items
      .map((it) => document.getElementById(it.id))
      .filter((el): el is HTMLElement => el !== null);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const i = items.findIndex((it) => it.id === e.target.id);
          if (i !== -1) setActive(i);
        }
      },
      { rootMargin: "-50% 0px -50% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items]);

  const progress = items.length > 1 ? active / (items.length - 1) : 0;

  return (
    <nav
      className="lp-srail"
      aria-label="Page sections"
      data-on={active > 0 ? "" : undefined}
      style={{ "--p": progress } as CSSProperties}
    >
      <ol>
        {items.map((it, i) => (
          <li key={it.id}>
            <a
              href={`#${it.id}`}
              aria-current={i === active ? "location" : undefined}
              data-done={i < active ? "" : undefined}
            >
              <span className="lp-srail-label">{it.label}</span>
              <span className="lp-srail-dot" aria-hidden="true" />
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
