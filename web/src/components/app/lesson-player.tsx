"use client";

import { useEffect, useRef, useState } from "react";
import { markWatched } from "@/lib/lessons/actions";

/* Minimal shape of the bits of the YouTube IFrame API we actually use —
 * cheaper than pulling in @types/youtube for four methods. */
type YTPlayer = {
  getCurrentTime: () => number;
  getDuration: () => number;
  destroy: () => void;
};
type YTNamespace = {
  Player: new (
    el: HTMLElement,
    opts: { videoId: string; playerVars?: Record<string, string | number> },
  ) => YTPlayer;
};
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/** Counts as watched here. Matches the brainstorm: near-the-end, not the credits. */
const WATCHED_FRACTION = 0.9;

/** Last known position per lesson. Lives in localStorage rather than the
 *  database: it changes every second, and losing it costs a student seconds. */
type SavedPosition = { t: number; d?: number };
const positionKey = (lessonId: string) => `bsms:video-pos:${lessonId}`;

/* Both helpers swallow everything they touch — private browsing throws on
 * localStorage access, and a resume point is never worth breaking playback. */
function readPosition(lessonId: string): SavedPosition | null {
  try {
    const raw = window.localStorage.getItem(positionKey(lessonId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedPosition | null;
    return typeof parsed?.t === "number" ? parsed : null;
  } catch {
    return null;
  }
}

function savePosition(lessonId: string, t: number, d: number) {
  try {
    window.localStorage.setItem(positionKey(lessonId), JSON.stringify({ t, d }));
  } catch {
    // No storage available — the student just starts from the top next time.
  }
}

/** One shared script load for the whole session, however many players mount. */
let apiPromise: Promise<YTNamespace> | null = null;
function loadYouTubeApi(): Promise<YTNamespace> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT!);
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
  return apiPromise;
}

export function LessonPlayer({
  lessonId,
  youtubeId,
  initiallyWatched,
}: {
  lessonId: string;
  youtubeId: string;
  initiallyWatched: boolean;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [watched, setWatched] = useState(initiallyWatched);

  // Read inside the polling loop without making it a dependency — re-running
  // the effect would tear down and rebuild the iframe mid-playback.
  const watchedRef = useRef(initiallyWatched);
  watchedRef.current = watched;

  useEffect(() => {
    let player: YTPlayer | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const reachedEnd = () => {
      if (watchedRef.current) return;
      watchedRef.current = true;
      setWatched(true);
      // Fire-and-forget: a failed write shouldn't interrupt the video. The
      // student can always replay, and the tick is cosmetic until it lands.
      void markWatched(lessonId).catch(() => {});
    };

    loadYouTubeApi().then((YT) => {
      if (cancelled || !mountRef.current) return;

      // Two guards on resuming: under five seconds in there is nothing worth
      // returning to, and a position saved near the end means they finished —
      // start fresh rather than dropping them back on the credits.
      const saved = readPosition(lessonId);
      const resumeAt =
        saved && saved.t >= 5 && (!saved.d || saved.t < saved.d * 0.85)
          ? Math.floor(saved.t)
          : null;

      player = new YT.Player(mountRef.current, {
        videoId: youtubeId,
        playerVars: {
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          ...(resumeAt === null ? {} : { start: resumeAt }),
        },
      });

      // Poll the player rather than react to its state events. Playback state
      // arrives over postMessage and is easy to miss — a background tab, a
      // fullscreen handoff, a seek — whereas getCurrentTime() is a direct call
      // that is always truthful. One tick a second costs nothing.
      timer = setInterval(() => {
        if (typeof player?.getDuration !== "function") return;
        const duration = player.getDuration();
        const current = player.getCurrentTime();
        // Keep saving after the lesson is marked watched — a rewatch should
        // resume too. A zero reading is the player still warming up, so it
        // must not overwrite a real position.
        if (current > 0) savePosition(lessonId, current, duration);
        if (duration <= 0) return;
        if (!watchedRef.current && current / duration >= WATCHED_FRACTION) reachedEnd();
      }, 1000);
    });

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      player?.destroy();
    };
  }, [lessonId, youtubeId]);

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-line bg-ink">
        {/* The API replaces this div with the iframe, so the ratio lives on the wrapper. */}
        <div className="aspect-video w-full">
          <div ref={mountRef} className="size-full" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {watched
          ? "✓ Watched — this one's marked off for you."
          : "Watch to the end and this marks itself off."}
      </p>
    </div>
  );
}
