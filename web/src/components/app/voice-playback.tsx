"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

function clock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Tries before the link is called failed: a phone waking up, or a tab whose
 *  sign-in is being refreshed, misses the first request and makes the next. */
const ATTEMPTS = 3;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Plays a stored voice note. The bucket is private, so the URL is signed on
 *  demand — teachers and the owning student are the only ones RLS lets through.
 *
 *  It used to give up on the first failed signing: a teacher on an iPad saw
 *  "could not be loaded" over a recording that was stored and theirs to hear,
 *  with nothing to press. It now retries, then offers Try again, and says so
 *  separately when the link worked but this device cannot play the audio. */
export function VoicePlayback({
  storagePath,
  durationS,
  label = "Recording",
}: {
  storagePath: string;
  durationS: number | null;
  label?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed" | "unplayable">("loading");
  const [round, setRound] = useState(0);

  useEffect(() => {
    let live = true;
    (async () => {
      for (let i = 0; i < ATTEMPTS && live; i++) {
        if (i) await wait(700 * i);
        const { data, error } = await supabaseBrowser()
          .storage.from("voice-notes")
          .createSignedUrl(storagePath, 3600);
        if (!live) return;
        if (data?.signedUrl) {
          setUrl(data.signedUrl);
          setState("ready");
          return;
        }
        if (i === ATTEMPTS - 1) console.error("Voice note link failed", storagePath, error);
      }
      if (live) setState("failed");
    })();
    return () => {
      live = false;
    };
  }, [storagePath, round]);

  const retry = useCallback(() => {
    setUrl(null);
    setState("loading");
    setRound((r) => r + 1);
  }, []);

  if (state === "failed" || state === "unplayable") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">
          {state === "failed"
            ? "This recording could not be loaded."
            : "This device could not play the recording. Try another browser, such as Chrome."}
        </p>
        <Button variant="outline" size="sm" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  }
  if (!url) {
    return <p className="text-sm text-muted-foreground">Loading recording…</p>;
  }

  return (
    <div className="space-y-1.5">
      <audio controls src={url} className="w-full" onError={() => setState("unplayable")} />
      <p className="text-xs text-muted-foreground">
        {label}
        {durationS ? ` · ${clock(durationS)}` : ""}
      </p>
    </div>
  );
}
