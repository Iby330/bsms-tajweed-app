"use client";

/**
 * Drag a question up or down within its section. The rows move under the
 * pointer with plain transforms (no re-render per frame); on release the
 * drop index goes to `onDrop` and the list re-renders in its new order.
 *
 * With a mouse or pen the whole row drags, except from its buttons and
 * fields. On touch only the grip ([data-drag-handle]) drags, so a finger can
 * still scroll the paper. Escape cancels. The arrow buttons stay the
 * keyboard route.
 */
import { flushSync } from "react-dom";

const THRESHOLD = 5;
const EDGE = 64;
const NOT_FROM = "button, a, input, textarea, select, label, [role=menuitem], [contenteditable=true]";

function scrollParent(el: HTMLElement): HTMLElement {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return (document.scrollingElement as HTMLElement) ?? document.documentElement;
}

/** Spread `onPointerDown` onto each row; the rows' parent is the list they reorder in. */
export function useDragSort(onDrop: (id: string, to: number) => void) {
  const onPointerDown = (e: React.PointerEvent<HTMLElement>, id: string) => {
    if (e.button !== 0) return;
    const target = e.target as Element;
    const handle = target.closest("[data-drag-handle]");
    if (!handle && (e.pointerType === "touch" || target.closest(NOT_FROM))) return;
    const list = e.currentTarget.parentElement;
    if (!list) return;
    const rows = [...list.querySelectorAll<HTMLElement>(":scope > [data-drag-id]")];
    const from = rows.findIndex((r) => r.dataset.dragId === id);
    if (from < 0 || rows.length < 2) return;
    if (handle) e.preventDefault();

    const el = rows[from];
    const rects = rows.map((r) => r.getBoundingClientRect());
    const gap = Math.max(0, rects[1].top - rects[0].bottom);
    const slot = rects[from].height + gap;
    const scroller = scrollParent(list);
    const isPage = scroller === document.scrollingElement || scroller === document.documentElement;
    const startY = e.clientY;
    const startScroll = scroller.scrollTop;
    const pointerId = e.pointerId;
    let lastY = startY;
    let started = false;
    let to = from;
    let raf = 0;

    const layout = () => {
      const dy = lastY - startY + (scroller.scrollTop - startScroll);
      el.style.transform = `translateY(${dy}px)`;
      const centre = rects[from].top + rects[from].height / 2 + dy;
      to = rects.filter((r, k) => k !== from && r.top + r.height / 2 < centre).length;
      rows.forEach((r, k) => {
        if (k === from) return;
        const shift = from < k && k <= to ? -slot : to <= k && k < from ? slot : 0;
        r.style.transform = shift ? `translateY(${shift}px)` : "";
      });
    };

    const autoScroll = () => {
      raf = 0;
      const top = isPage ? 0 : scroller.getBoundingClientRect().top;
      const bottom = isPage ? window.innerHeight : scroller.getBoundingClientRect().bottom;
      const speed = lastY < top + EDGE ? -(top + EDGE - lastY) / 4 : lastY > bottom - EDGE ? (lastY - (bottom - EDGE)) / 4 : 0;
      if (!speed) return;
      scroller.scrollTop += Math.max(-16, Math.min(16, speed));
      layout();
      raf = requestAnimationFrame(autoScroll);
    };

    const begin = () => {
      started = true;
      window.getSelection()?.removeAllRanges();
      document.body.style.userSelect = "none";
      document.body.style.cursor = "grabbing";
      el.dataset.dragging = "";
      el.style.transition = "none";
      rows.forEach((r, k) => { if (k !== from) r.style.transition = "transform 150ms ease"; });
    };

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      lastY = ev.clientY;
      if (!started) {
        if (Math.abs(lastY - startY) < THRESHOLD) return;
        begin();
      }
      layout();
      if (!raf) raf = requestAnimationFrame(autoScroll);
    };

    const finish = (commit: boolean) => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key, true);
      if (raf) cancelAnimationFrame(raf);
      if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
      if (started && commit && to !== from) flushSync(() => onDrop(id, to));
      rows.forEach((r) => { r.style.transform = ""; r.style.transition = ""; });
      delete el.dataset.dragging;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      if (started) {
        // The release would otherwise land as a click on whatever is under it.
        window.addEventListener("click", swallow, { capture: true, once: true });
        setTimeout(() => window.removeEventListener("click", swallow, true), 0);
      }
    };
    const swallow = (c: MouseEvent) => { c.stopPropagation(); c.preventDefault(); };
    const up = (ev: PointerEvent) => { if (ev.pointerId === pointerId) finish(true); };
    const cancel = (ev: PointerEvent) => { if (ev.pointerId === pointerId) finish(false); };
    const key = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      ev.preventDefault();
      ev.stopPropagation();
      finish(false);
    };

    el.setPointerCapture(pointerId);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key, true);
  };

  return { onPointerDown };
}
