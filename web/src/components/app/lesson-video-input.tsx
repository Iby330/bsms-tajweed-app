"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { setLessonVideo } from "@/lib/lessons/actions";

/** Paste-a-share-link control on the curriculum page. Collapsed to a single
 *  word until a teacher actually wants to change something. */
export function LessonVideoInput({
  lessonId,
  initial,
}: {
  lessonId: string;
  initial: string | null;
}) {
  const [videoId, setVideoId] = useState(initial);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(next: string) {
    setError(null);
    startTransition(async () => {
      const result = await setLessonVideo(lessonId, next);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setVideoId(result.youtubeId);
      setValue("");
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <span className="flex shrink-0 items-center gap-1.5">
        {videoId ? (
          <a
            href={`https://youtu.be/${videoId}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] text-muted-foreground underline-offset-2 hover:underline"
          >
            {videoId}
          </a>
        ) : (
          <span className="text-xs text-warn">no video</span>
        )}
        <Button
          variant="ghost"
          size="xs"
          onClick={() => {
            setValue(videoId ?? "");
            setOpen(true);
          }}
        >
          {videoId ? "Change" : "Add"}
        </Button>
      </span>
    );
  }

  return (
    <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
      <Input
        autoFocus
        value={value}
        disabled={pending}
        placeholder="Paste YouTube link"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save(value);
          if (e.key === "Escape") {
            setOpen(false);
            setError(null);
          }
        }}
        className="h-7 w-56 text-xs"
      />
      <Button size="xs" disabled={pending} onClick={() => save(value)}>
        {pending ? "Saving…" : "Save"}
      </Button>
      {videoId && (
        <Button variant="ghost" size="xs" disabled={pending} onClick={() => save("")}>
          Remove
        </Button>
      )}
      <Button
        variant="ghost"
        size="xs"
        disabled={pending}
        onClick={() => {
          setOpen(false);
          setError(null);
        }}
      >
        Cancel
      </Button>
      {error && <span className="w-full text-right text-[11px] text-danger">{error}</span>}
    </span>
  );
}
