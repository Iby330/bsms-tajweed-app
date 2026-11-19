"use client";

/**
 * Screen sizing for the Qur'anic pictures, following the print view's rule
 * (app/exam-print/[paperId]/print-toolbar.tsx) so the sheet previews what
 * prints. A picture's pixel height is roughly its number of lines of mushaf
 * text (~170px a line in the source documents): a one-line picture — a word
 * or an ayah — is capped at one line's height, a passage gets a line's worth
 * per line up to a ceiling, and a picture is never shown bigger than it is.
 * Option pictures get a smaller line, the same for every option, so a list
 * of them reads evenly.
 *
 * Until a picture has loaded, the CSS caps in exam-builder.css (one line, by
 * context) hold, which is the safe side to err on.
 */
import { useEffect } from "react";

const LINE_PX = 170;

/** px per line for a one-line picture, px per line for a passage, ceiling — by where the picture sits. */
type Scale = { one: number; option: number; per: number; max: number };

/** The sheet is A4 text width (~170mm) in ~736px: about 4.3px a millimetre, as print's 22mm / 13mm / 16mm / 75mm. */
const SHEET: Scale = { one: 92, option: 56, per: 68, max: 320 };
/** A bank card is narrow and many sit together: smaller, still legible. */
const CARD: Scale = { one: 64, option: 44, per: 48, max: 220 };

export function fitPicture(img: HTMLImageElement) {
  if (!img.naturalHeight || !img.classList.contains("exam-q-image")) return;
  const scale = img.closest(".exam-sheet") ? SHEET : img.closest(".exam-tree") ? CARD : null;
  if (!scale) return;
  const lines = Math.max(1, Math.round(img.naturalHeight / LINE_PX));
  const inOptions = !!img.closest(".exam-q-options");
  const cap = lines === 1 ? (inOptions ? scale.option : scale.one) : Math.min(scale.max, lines * (inOptions ? scale.option : scale.per));
  img.style.setProperty("max-height", `${Math.min(cap, img.naturalHeight)}px`);
}

/**
 * Size every exam picture on the page now and as each one loads (bank rules
 * render their cards only when opened, so pictures keep arriving). One
 * capture-phase listener on the document: load events don't bubble.
 */
export function useFitPictures() {
  useEffect(() => {
    document.querySelectorAll<HTMLImageElement>("img.exam-q-image").forEach((img) => {
      if (img.complete) fitPicture(img);
    });
    const onLoad = (e: Event) => {
      if (e.target instanceof HTMLImageElement) fitPicture(e.target);
    };
    document.addEventListener("load", onLoad, true);
    return () => document.removeEventListener("load", onLoad, true);
  }, []);
}
