"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { usePrefersReducedMotion } from "@/lib/usePrefersReducedMotion";

export type RailItem = { id: string; label: string };

/**
 * The page's progress, as a line of dots down the right-hand edge, that you
 * can also drive — like the page dots on an iPhone home screen.
 *
 * It replaced scroll snapping as the "where am I" signal. Snapping told a
 * reader they had arrived somewhere by parking them there, which felt
 * magnetic; this tells them without taking the scroll away. The line fills
 * with sage as they go and the current section's dot is lit.
 *
 * Driving it:
 *  · tap (or click) a dot and the page glides to that section;
 *  · press and slide along the rail and it SCRUBS — every dot the finger
 *    passes jumps the page straight there, and the section's name rides
 *    beside the finger, exactly as dragging across the home-screen dots
 *    flicks from page to page.
 * The whole capsule is the target, not the 5px dots: a touch anywhere on it
 * goes to the nearest dot, so it is usable on a phone without precision.
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
  const [scrubbing, setScrubbing] = useState(false);
  const list = useRef<HTMLOListElement>(null);
  const last = useRef(-1);
  const moved = useRef(false);
  const reduced = usePrefersReducedMotion();

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

  function go(i: number, smooth: boolean) {
    const el = document.getElementById(items[i].id);
    if (!el) return;
    setActive(i);
    el.scrollIntoView({ behavior: smooth && !reduced ? "smooth" : "auto", block: "start" });
  }

  /** The dot nearest a finger's height, so the whole rail is the target. */
  function nearest(y: number): number {
    const dots = list.current?.querySelectorAll("li");
    if (!dots?.length) return 0;
    let best = 0;
    let dist = Infinity;
    dots.forEach((li, i) => {
      const r = li.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - y);
      if (d < dist) {
        dist = d;
        best = i;
      }
    });
    return best;
  }

  function onPointerDown(e: PointerEvent<HTMLElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    last.current = nearest(e.clientY);
    moved.current = false;
    setScrubbing(true);
  }

  function onPointerMove(e: PointerEvent<HTMLElement>) {
    if (!scrubbing) return;
    const i = nearest(e.clientY);
    if (i === last.current) return;
    last.current = i;
    moved.current = true;
    go(i, false); // scrubbing jumps, as the home-screen dots do
  }

  function onPointerUp(e: PointerEvent<HTMLElement>) {
    if (!scrubbing) return;
    setScrubbing(false);
    // A press that never slid is a tap: glide to the dot under it.
    if (!moved.current) go(nearest(e.clientY), true);
  }

  /* The dots stay real links (keyboard, no JS), but the pointer handlers
     above have already moved the page, so the browser's own jump is
     cancelled. A keyboard "click" has detail 0 and is honoured. */
  function onClick(e: MouseEvent<HTMLAnchorElement>, i: number) {
    e.preventDefault();
    if (e.detail === 0) go(i, true);
  }

  const progress = items.length > 1 ? active / (items.length - 1) : 0;

  return (
    <nav
      className="lp-srail"
      aria-label="Page sections"
      data-on={active > 0 || scrubbing ? "" : undefined}
      data-scrub={scrubbing ? "" : undefined}
      style={{ "--p": progress } as CSSProperties}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setScrubbing(false)}
    >
      <ol ref={list}>
        {items.map((it, i) => (
          <li key={it.id}>
            <a
              href={`#${it.id}`}
              aria-current={i === active ? "location" : undefined}
              data-done={i < active ? "" : undefined}
              onClick={(e) => onClick(e, i)}
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
