"use client";

import { useEffect, useRef } from "react";

/**
 * One tooltip for the whole page.
 *
 * The homework blocks and the hifz beads are deliberately tiny — twenty of
 * one and thirty of the other have to fit in a panel — so the detail behind
 * each has to arrive on hover rather than in the layout. Rather than mount a
 * tooltip per mark (fifty listeners on Home alone), a single element listens
 * at the document and reads the data off whatever was hovered.
 *
 * Marks opt in by carrying `data-tip`, and may add `data-tip-meta`,
 * `data-tip-value` and `data-tip-ar` for the Arabic line.
 *
 * Focus counts as hover, so the same detail is reachable by keyboard — the
 * marks are already tabbable.
 *
 * A phone has no hover at all, so there a tap opens the tip and a second tap
 * (or a tap anywhere else, or Escape) closes it again.
 */
export function HoverTip() {
  const tip = useRef<HTMLDivElement>(null);
  const openedBy = useRef<"hover" | "tap" | null>(null);
  const current = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = tip.current;
    if (!el) return;

    // Asked per event, not once at mount: jsdom has no matchMedia at all, and
    // a hybrid machine gains and loses a mouse while the page stays open.
    const touch = () => window.matchMedia?.("(hover: none)").matches ?? false;

    const position = (target: HTMLElement) => {
      const r = target.getBoundingClientRect();
      const w = el.offsetWidth;
      // Sits above the mark, unless that would push it off the top of the
      // window or over the heading — then it flips underneath.
      const below = r.top < el.offsetHeight + 16;
      el.classList.toggle("below", below);
      el.style.left = `${Math.min(Math.max(r.left + r.width / 2, w / 2 + 8), window.innerWidth - w / 2 - 8)}px`;
      el.style.top = `${below ? r.bottom : r.top}px`;
    };

    const show = (target: HTMLElement, by: "hover" | "tap") => {
      const title = target.dataset.tip;
      if (!title) return;
      const ar = target.dataset.tipAr;
      const meta = target.dataset.tipMeta;
      const value = target.dataset.tipValue;

      el.innerHTML = "";
      const add = (cls: string, text: string) => {
        const d = document.createElement("div");
        d.className = cls;
        d.textContent = text; // textContent, never innerHTML: this is user data
        el.appendChild(d);
      };
      if (ar) add("ar", ar);
      add("h", title);
      if (meta) add("m", meta);
      if (value) add("v", value);

      el.classList.add("on");
      openedBy.current = by;
      current.current = target;
      position(target);
    };
    const hide = () => {
      el.classList.remove("on");
      openedBy.current = null;
      current.current = null;
    };

    const onOver = (e: Event) => {
      const t = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-tip]");
      if (t) show(t, "hover");
    };
    const onOut = (e: Event) => {
      if ((e.target as HTMLElement | null)?.closest("[data-tip]")) hide();
    };
    // A touch screen fires mouse events too, a beat after the tap. Ignoring
    // them leaves the click handler below as the only way in.
    const onMouseOver = (e: Event) => {
      if (!touch()) onOver(e);
    };
    const onMouseOut = (e: Event) => {
      if (!touch()) onOut(e);
    };

    const onClick = (e: Event) => {
      const t = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-tip]");
      if (!t) {
        hide(); // a tap outside any mark dismisses
        return;
      }
      // Links and buttons already answer a tap; a tooltip would fight them.
      if (t.closest("a, button, [href]")) return;
      // Only a tip the tap itself opened toggles shut: on a phone the focus
      // that precedes the click has usually opened it already.
      if (t === current.current && openedBy.current === "tap") hide();
      else show(t, "tap");
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };

    const onScroll = () => {
      const t = current.current;
      if (openedBy.current !== "tap" || !t) {
        hide();
        return;
      }
      // A touch scroll fires constantly, and hiding on it would close the tip
      // the tap just opened. Follow the mark instead, and let go only once it
      // has left the screen.
      const r = t.getBoundingClientRect();
      const gone =
        r.bottom < 0 ||
        r.top > window.innerHeight ||
        r.right < 0 ||
        r.left > window.innerWidth;
      if (gone) hide();
      else requestAnimationFrame(() => position(t));
    };

    document.addEventListener("mouseover", onMouseOver);
    document.addEventListener("mouseout", onMouseOut);
    document.addEventListener("focusin", onOver);
    document.addEventListener("focusout", onOut);
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      document.removeEventListener("mouseover", onMouseOver);
      document.removeEventListener("mouseout", onMouseOut);
      document.removeEventListener("focusin", onOver);
      document.removeEventListener("focusout", onOut);
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return <div id="hovertip" ref={tip} role="status" aria-live="polite" />;
}
