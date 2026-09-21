"use client";

/**
 * The hero animation, embedded live.
 *
 * ── Why a live Player and not a video file ─────────────────────────────────
 * The subject is Arabic type with tajweed marks on it. An H.264 encode at a
 * hero's bitrate softens exactly the fine detail that carries the meaning —
 * a sukun, a shadda, the small ring over a silent alif — and a dark navy
 * ground is the worst case for 8-bit banding. Running the same Remotion
 * composition live keeps every glyph as a vector at whatever size and pixel
 * density the visitor's screen has, costs no video bytes, and needs no poster
 * frame or reduced-motion fallback file.
 *
 * ── Two compositions, not one scaled ───────────────────────────────────────
 * Desktop is 2560×1440, mobile 1080×1920, chosen on a media query. Squeezing
 * one 16:9 composition onto a phone would leave the verse and the eight-rule
 * key too small to read, which for a page selling tajweed teaching is the one
 * thing that must not happen.
 *
 * ── Not a control surface ──────────────────────────────────────────────────
 * No controls, no click-to-play, no keyboard handling, no pointer events at
 * all. The visitor watches it; they never operate it. `aria-hidden` because
 * the verse is decorative here and is given to screen readers as real text by
 * the hero around it — a screen reader should not have to sit through a
 * 41-second animation to learn what it says.
 *
 * ── Reduced motion ─────────────────────────────────────────────────────────
 * Honoured. The composition is deterministic, so "still" is simply frame 0 of
 * the same piece: the opening section, fully rendered, ball parked. Nobody
 * gets a blank box, and nothing separate has to be produced or kept in step.
 */

import { Player, type PlayerRef } from "@remotion/player";
import { useEffect, useRef, useState } from "react";
import { TajweedAyah } from "./TajweedAyah";
import { TIMELINE, FPS } from "@/lib/tajweed/timeline";

const DESKTOP = { width: 2560, height: 1440 } as const;
const MOBILE = { width: 1080, height: 1920 } as const;

/** Matches the breakpoint the rest of the landing page uses. */
const MOBILE_QUERY = "(max-width: 767px)";
const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Height-to-width limits for the composition in `fill` mode. Inside them the
 * composition takes the slot's exact shape; outside them it stops stretching
 * and the Player letterboxes the rest — invisibly, because on the page the
 * ground is transparent. The limits exist because the layout inside is
 * proportional but not infinitely so: at 4:1 the key would crowd the verse.
 */
const DESKTOP_RATIO = { min: 0.26, max: 0.8 } as const;
const MOBILE_RATIO = { min: 1.15, max: 2.1 } as const;

function useBoxSize() {
  // This measures the Player's OWN box, never text. The old hero's fragility
  // came from measuring glyphs in a live text node; a container's size is a
  // plain layout fact that is correct the moment it is read.
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      if (width > 0 && height > 0) setBox({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, box };
}

function useMatch(query: string): boolean {
  // `false` on the server and on first paint, then corrected in an effect.
  // Guessing the other way would flash the wrong composition on every phone.
  const [on, setOn] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const apply = () => setOn(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [query]);
  return on;
}

export function TajweedHeroPlayer({
  className,
  /**
   * Freeze on one frame instead of playing. A lens for the preview route and
   * for headless checks — headless Chrome produces almost no animation frames,
   * so without a way to pose the piece every screenshot comes back looking
   * like the first one. It is NOT a control on the hero, which has none.
   */
  frame,
  /**
   * "fixed" plays the spec sizes (2560×1440 / 1080×1920) — what a rendered
   * file would be, and what the full-bleed preview shows.
   * "fill" keeps the width and takes the height from the slot it is placed
   * in, so on the landing page the piece is shaped by the hero region rather
   * than letterboxed inside it. It also drops the navy ground so the page's
   * tiled calligraphy shows through.
   */
  fit = "fixed",
}: {
  className?: string;
  frame?: number;
  fit?: "fixed" | "fill";
}) {
  const mobile = useMatch(MOBILE_QUERY);
  const reduced = useMatch(REDUCED_QUERY);
  const posed = Number.isFinite(frame);
  const { ref, box } = useBoxSize();

  /* The Player hydrates a beat after the server-rendered headline paints
     (~200ms in production). Fading it in turns that gap into an entrance
     instead of a pop. This is page DOM around the Player, not anything the
     composition renders, so a CSS transition is fine here — the Remotion rule
     against CSS animation is about frames that have to be reproducible. */
  const [shown, setShown] = useState(false);

  /* Start playback ourselves rather than trusting `autoPlay` alone.
     Chrome's autoplay policy blocks unmuted media until the visitor has
     interacted with the page, and by default the Player prepares for audio —
     so in a real Chrome tab `autoPlay` failed SILENTLY and the hero sat on
     frame 0 (the in-app preview browser is more permissive, which is how it
     slipped through). The piece has no sound at all, so it plays muted with
     no audio tags, and we call play() once the Player exists and again
     whenever it remounts at a new size. */
  const playerRef = useRef<PlayerRef>(null);
  const shouldPlay = !reduced && !posed;
  useEffect(() => {
    if (fit !== "fill" || !box) return;
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [fit, box]);

  useEffect(() => {
    if (!shouldPlay) return;
    const id = requestAnimationFrame(() => {
      const p = playerRef.current;
      if (p && !p.isPlaying()) p.play();
    });
    return () => cancelAnimationFrame(id);
  }, [shouldPlay, box, mobile]);

  const base = mobile ? MOBILE : DESKTOP;
  let size: { width: number; height: number } = base;
  if (fit === "fill") {
    if (!box) {
      // Unmeasured: render the empty box so it can be measured, and nothing in
      // it — a first paint at the wrong aspect would visibly jump.
      return <div ref={ref} className={className} aria-hidden style={BOX} />;
    }
    const lim = mobile ? MOBILE_RATIO : DESKTOP_RATIO;
    const ratio = Math.min(lim.max, Math.max(lim.min, box.h / box.w));
    size = { width: base.width, height: Math.round(base.width * ratio) };
  }

  const fade: React.CSSProperties =
    fit === "fill"
      ? { opacity: shown ? 1 : 0, transition: reduced ? "none" : "opacity 700ms ease-out" }
      : {};

  return (
    <div ref={ref} className={className} aria-hidden style={{ ...BOX, ...fade }}>
      <Player
        ref={playerRef}
        component={TajweedAyah}
        inputProps={{
          variant: mobile ? ("mobile" as const) : ("desktop" as const),
          ground: fit === "fill" ? ("none" as const) : ("navy" as const),
          gloss: fit !== "fill",
        }}
        durationInFrames={TIMELINE.durationInFrames}
        fps={FPS}
        compositionWidth={size.width}
        compositionHeight={size.height}
        initialFrame={posed ? (frame as number) : 0}
        autoPlay={shouldPlay}
        loop={shouldPlay}
        initiallyMuted
        numberOfSharedAudioTags={0}
        controls={false}
        clickToPlay={false}
        doubleClickToFullscreen={false}
        spaceKeyToPlayOrPause={false}
        showPosterWhenPaused={false}
        moveToBeginningWhenEnded={false}
        acknowledgeRemotionLicense
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}

const BOX: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  overflow: "hidden",
  pointerEvents: "none",
  contain: "strict",
};

export default TajweedHeroPlayer;
