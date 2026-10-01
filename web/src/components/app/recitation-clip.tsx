"use client";

import { useEffect, useRef, useState, useId } from "react";
import { LoaderCircle, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Clip } from "@/lib/homework/media";
import { cn } from "@/lib/utils";

const FAILED = "Couldn't load the recitation. Check your connection and try again.";

/**
 * The one clip playing on the page, so starting another can stop it. Module
 * scope rather than context because the rule is page-wide whoever renders
 * the players: two recitations over each other are noise, and a student
 * comparing two options needs to hear each on its own.
 */
let active: { stop: () => void } | null = null;

type State = "idle" | "loading" | "playing" | "error";

/**
 * Plays a slice of a recitation: press, hear exactly [startMs, endMs) of the
 * file, and stop. The listening question ("name the rule you heard") plays
 * two or three words out of an ayah, and the words either side of them are
 * the context the question is testing the student without — so the end of
 * the slice is enforced, not suggested.
 *
 * WHY NOT <audio controls>. A native player shows, and lets the student drag
 * to, the whole ayah. One button that always plays the same slice is the
 * question; a scrubber is the answer sheet.
 *
 * HOW THE END IS HELD. `timeupdate` fires about four times a second, so on
 * its own it would run up to 250 ms past the end, about a syllable. A frame
 * loop checks the playhead while the clip plays and stops within a frame of
 * the end; `timeupdate` stays on as the backstop for a background tab, where
 * frames are paused. Paused, not run to the end of the file.
 *
 * `preload="none"` because a homework can carry a player on every option, and
 * a page that downloads ten ayahs on open, on a phone, for a student who may
 * play two of them, is the wrong default. The cost is a short load on the
 * first press, which the button says out loud.
 *
 * The reciter is never named: the audio is the question, and the label is
 * where it comes from in the mushaf, nothing more.
 */
export function RecitationClip({
  clip,
  compact = false,
  name,
  className,
}: {
  clip: Clip;
  /** An icon-sized button for an option row: no label, same behaviour. */
  compact?: boolean;
  /**
   * What the button plays, for its accessible name ("Play option 2"). A row
   * of identical "Play recitation" buttons tells a screen-reader user nothing
   * about which option each one belongs to.
   */
  name?: string;
  className?: string;
}) {
  const sourceId = useId();
  const audioRef = useRef<HTMLAudioElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const frameRef = useRef<number | null>(null);
  const [state, setState] = useState<State>("idle");
  // Read from event handlers and the frame loop, which close over the render
  // they were made in; the state above is for drawing only.
  const stateRef = useRef<State>("idle");
  function set(s: State) {
    stateRef.current = s;
    setState(s);
  }
  // Which press a play() promise belongs to, so a late rejection from an
  // earlier press cannot stop the one playing now.
  const runRef = useRef(0);

  const start = (clip.startMs ?? 0) / 1000;
  const end = clip.endMs === undefined ? null : clip.endMs / 1000;

  function drawProgress(audio: HTMLAudioElement | null) {
    const bar = barRef.current;
    if (!bar) return;
    let p = 0;
    if (audio) {
      const span = end === null ? audio.duration : end - start;
      if (Number.isFinite(span) && span > 0) {
        p = Math.min(1, Math.max(0, (audio.currentTime - start) / span));
      }
    }
    // Written straight to the element: this runs every frame, and a state
    // update per frame would re-render the player sixty times a second to
    // move one bar. `scale`, not `transform`: Tailwind 4's scale-x-0 on the
    // bar is the `scale` property, and a transform would multiply with it
    // and stay at nothing.
    bar.style.scale = `${p} 1`;
  }

  function cancelFrame() {
    if (frameRef.current !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(frameRef.current);
    }
    frameRef.current = null;
  }

  // This player's entry in the page-wide registry: one object for its whole
  // life, so "is the active clip me?" is an identity check, calling through
  // to whichever `stop` the latest render made.
  const stopRef = useRef<() => void>(() => {});
  const [self] = useState(() => ({ stop: () => stopRef.current() }));

  /** Pause and go back to the start state. Safe to call more than once. */
  function stop(next: State = "idle") {
    cancelFrame();
    audioRef.current?.pause();
    drawProgress(null);
    if (active === self) active = null;
    set(next);
  }
  useEffect(() => {
    stopRef.current = () => stop();
  });

  /** True once the slice is over, and stops it. */
  function pastEnd() {
    const audio = audioRef.current;
    if (!audio || end === null || audio.currentTime < end) return false;
    stop();
    return true;
  }

  function tick() {
    frameRef.current = null;
    if (stateRef.current !== "playing" && stateRef.current !== "loading") return;
    if (pastEnd()) return;
    drawProgress(audioRef.current);
    if (typeof requestAnimationFrame === "function") {
      frameRef.current = requestAnimationFrame(tick);
    }
  }

  function play() {
    const audio = audioRef.current;
    if (!audio) return;

    // One at a time, page-wide.
    if (active && active !== self) active.stop();
    active = self;

    // An element that failed stays failed until it is told to fetch again.
    if (stateRef.current === "error" || audio.error) audio.load();
    set("loading");
    const run = ++runRef.current;

    // Seek before play, in the same click: iOS only lets audio start inside
    // the gesture that asked for it, so there is no waiting for metadata
    // first. Before metadata this sets the element's default start position,
    // which it seeks to once it knows the file; onLoadedMetadata re-seeks for
    // any browser that dropped it.
    try {
      audio.currentTime = start;
    } catch {
      // Ancient engines throw on a seek before metadata; the re-seek covers it.
    }
    audio.play().catch((e: unknown) => {
      // Stopped while it was still starting (Stop, or another clip), or
      // pressed again since: nothing of this press is left to report on.
      if (run !== runRef.current || stateRef.current === "idle") return;
      // AbortError is a play() overtaken by a pause or a reload, not a failed
      // file: back to the play button, quietly. Anything else, a refused or
      // unplayable source, is a failure and says so.
      stop(e instanceof DOMException && e.name === "AbortError" ? "idle" : "error");
    });
    cancelFrame();
    tick();
  }

  // Leaving the page stops the audio. The element is captured now because
  // React has already detached the ref by the time this cleanup runs.
  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (frameRef.current !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(frameRef.current);
      }
      audio?.pause();
      if (active === self) active = null;
    };
  }, [self]);

  const busy = state === "loading";
  const playing = state === "playing";
  const label = busy ? "Loading…" : playing ? "Stop" : "Play recitation";
  const named = name ? `${busy ? "Loading…" : playing ? "Stop" : "Play"} ${name}` : label;

  const button = (
    <Button
      type="button"
      variant={compact ? "outline" : "default"}
      size={compact ? "icon-sm" : "default"}
      aria-label={compact ? named : undefined}
      aria-describedby={!compact && clip.label ? sourceId : undefined}
      aria-busy={busy || undefined}
      onClick={(e) => {
        // On an option row this button sits beside a radio. It must never
        // count as choosing that option.
        e.preventDefault();
        e.stopPropagation();
        if (busy || playing) stop();
        else play();
      }}
      // On a phone an icon-sm button is under the 44px a thumb needs; the option
      // rows have room for it, so it grows there and stays compact on desktop.
      className={cn("relative overflow-hidden", compact && "shrink-0 max-sm:size-11")}
    >
      {busy ? (
        <LoaderCircle aria-hidden className="animate-spin" />
      ) : playing ? (
        <Square aria-hidden className="fill-current" />
      ) : (
        <Play aria-hidden className="fill-current" />
      )}
      {!compact && label}
      {/* How far through the slice, along the foot of the button. */}
      <span
        ref={barRef}
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 bg-current opacity-60"
      />
    </Button>
  );

  return (
    <div className={cn(compact ? "inline-flex flex-col items-start" : "space-y-1.5", className)}>
      <audio
        ref={audioRef}
        src={clip.url}
        preload="none"
        onPlaying={() => {
          if (stateRef.current === "loading") set("playing");
        }}
        onLoadedMetadata={(e) => {
          const audio = e.currentTarget;
          if (stateRef.current !== "idle" && Math.abs(audio.currentTime - start) > 0.25) {
            audio.currentTime = start;
          }
        }}
        onTimeUpdate={() => {
          if (stateRef.current === "playing") pastEnd();
        }}
        onEnded={() => stop()}
        // Paused from outside: the phone's lock screen, a headset button.
        onPause={() => {
          if (stateRef.current === "playing") stop();
        }}
        onError={() => stop("error")}
      />
      <div className="flex flex-wrap items-center gap-2">
        {button}
        {!compact && clip.label && (
          <span id={sourceId} className="text-xs text-muted-foreground">{clip.label}</span>
        )}
      </div>
      {state === "error" && (
        <p role="alert" className="text-xs text-danger">
          {FAILED}
        </p>
      )}
    </div>
  );
}
