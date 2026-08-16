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
 */
export function HoverTip() {
  const tip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = tip.current;
    if (!el) return;

    const show = (target: HTMLElement) => {
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
      const r = target.getBoundingClientRect();
      const w = el.offsetWidth;
      // Sits above the mark, unless that would push it off the top of the
      // window or over the heading — then it flips underneath.
      const below = r.top < el.offsetHeight + 16;
      el.classList.toggle("below", below);
      el.style.left = `${Math.min(Math.max(r.left + r.width / 2, w / 2 + 8), window.innerWidth - w / 2 - 8)}px`;
      el.style.top = `${below ? r.bottom : r.top}px`;
    };
    const hide = () => el.classList.remove("on");

    const onOver = (e: Event) => {
      const t = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-tip]");
      if (t) show(t);
    };
    const onOut = (e: Event) => {
      if ((e.target as HTMLElement | null)?.closest("[data-tip]")) hide();
    };

    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    document.addEventListener("focusin", onOver);
    document.addEventListener("focusout", onOut);
    window.addEventListener("scroll", hide, { passive: true });
    return () => {
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      document.removeEventListener("focusin", onOver);
      document.removeEventListener("focusout", onOut);
      window.removeEventListener("scroll", hide);
    };
  }, []);

  return <div id="hovertip" ref={tip} role="status" aria-live="polite" />;
}
