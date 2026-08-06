"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

function clock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Plays a stored voice note. The bucket is private, so the URL is signed on
 *  demand — teachers and the owning student are the only ones RLS lets through. */
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
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    supabaseBrowser()
      .storage.from("voice-notes")
      .createSignedUrl(storagePath, 3600)
      .then(({ data }) => {
        if (!live) return;
        if (data?.signedUrl) setUrl(data.signedUrl);
        else setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [storagePath]);

  if (failed) {
    return <p className="text-sm text-muted-foreground">This recording could not be loaded.</p>;
  }
  if (!url) {
    return <p className="text-sm text-muted-foreground">Loading recording…</p>;
  }

  return (
    <div className="space-y-1.5">
      <audio controls src={url} className="w-full" />
      <p className="text-xs text-muted-foreground">
        {label}
        {durationS ? ` · ${clock(durationS)}` : ""}
      </p>
    </div>
  );
}
