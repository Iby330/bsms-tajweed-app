"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { pickRecordingFormat } from "@/lib/voice/format";
import { saveVoiceNote, deleteVoiceNote } from "@/lib/voice/actions";
import { VoicePlayback } from "@/components/app/voice-playback";
import { Button } from "@/components/ui/button";

const BUCKET = "voice-notes";

function clock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Record a recitation for a practical task, straight in the browser.
 *
 * Replaces "tick the box to say you sent your recording" — the whole point of
 * the Task questions is that a teacher hears the student recite, and chasing
 * WhatsApp voice notes was the thing this app is meant to end.
 */
export function VoiceRecorder({
  submissionId,
  questionId,
  initialPath,
  initialDuration,
  readOnly,
}: {
  submissionId: string;
  questionId: string;
  initialPath: string | null;
  initialDuration: number | null;
  readOnly: boolean;
}) {
  const [path, setPath] = useState(initialPath);
  const [duration, setDuration] = useState(initialDuration ?? 0);
  const [url, setUrl] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Kept in a ref because `recorder.onstop` closes over render-time values.
  const elapsedRef = useRef(0);

  /** Bucket is private, so playback needs a short-lived signed URL. */
  const loadUrl = useCallback(async (p: string) => {
    const { data } = await supabaseBrowser().storage.from(BUCKET).createSignedUrl(p, 3600);
    setUrl(data?.signedUrl ?? null);
  }, []);

  useEffect(() => {
    if (path) void loadUrl(path);
  }, [path, loadUrl]);

  // Never leave the microphone light on.
  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const format = pickRecordingFormat(
        typeof MediaRecorder !== "undefined" ? MediaRecorder.isTypeSupported : undefined,
      );
      const recorder = new MediaRecorder(
        stream,
        format.mimeType ? { mimeType: format.mimeType } : undefined,
      );
      recorderRef.current = recorder;

      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        const seconds = elapsedRef.current;
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        void upload(new Blob(chunks, { type: recorder.mimeType || format.mimeType }), format.extension, seconds);
      };

      recorder.start();
      setRecording(true);
      setElapsed(0);
      elapsedRef.current = 0;
      tickRef.current = setInterval(() => {
        elapsedRef.current += 1;
        setElapsed(elapsedRef.current);
      }, 1000);
    } catch {
      setError(
        "No microphone access. Allow it in your browser settings, then try again.",
      );
    }
  }

  function stop() {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    setRecording(false);
    recorderRef.current?.stop();
  }

  async function upload(blob: Blob, extension: string, seconds: number) {
    setBusy(true);
    setError(null);
    try {
      const supabase = supabaseBrowser();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("signed out");

      // Storage RLS keys off the first path segment being the user's id.
      const objectPath = `${user.id}/${submissionId}/${questionId}.${extension}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(objectPath, blob, { upsert: true, contentType: blob.type || undefined });
      if (upErr) throw upErr;

      const saved = await saveVoiceNote(submissionId, questionId, objectPath, seconds);
      if (!saved.ok) throw new Error(saved.error);

      setDuration(seconds);
      setPath(objectPath);
      await loadUrl(objectPath);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    setBusy(true);
    const supabase = supabaseBrowser();
    if (path) await supabase.storage.from(BUCKET).remove([path]);
    await deleteVoiceNote(submissionId, questionId);
    setPath(null);
    setUrl(null);
    setDuration(0);
    setBusy(false);
  }

  if (readOnly) {
    return path ? (
      <VoicePlayback storagePath={path} durationS={duration} label="Your recording" />
    ) : (
      <p className="text-sm text-muted-foreground">No recording was sent for this task.</p>
    );
  }

  return (
    <div className="space-y-2.5">
      {path && url && <audio controls src={url} className="w-full" />}

      <div className="flex flex-wrap items-center gap-2">
        {recording ? (
          <>
            <Button variant="destructive" onClick={stop} size="sm">
              Stop recording
            </Button>
            <span className="flex items-center gap-1.5 text-sm tabular-nums text-danger">
              <span className="inline-block size-2 animate-pulse rounded-full bg-danger" />
              {clock(elapsed)}
            </span>
          </>
        ) : (
          <>
            <Button variant={path ? "outline" : "default"} size="sm" disabled={busy} onClick={start}>
              {busy ? "Saving…" : path ? "Record again" : "Record my recitation"}
            </Button>
            {path && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={discard}>
                Delete
              </Button>
            )}
          </>
        )}
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}
      {!path && !recording && !error && (
        <p className="text-xs text-muted-foreground">
          Your teacher listens to this — find somewhere quiet and take your time.
        </p>
      )}
    </div>
  );
}
