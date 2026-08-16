"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { removeAvatar, saveAvatar } from "@/lib/account/avatar-actions";
import { Button } from "@/components/ui/button";

const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Add, change or remove a profile picture.
 *
 * The picture is optional at invitation time, so most people arrive here
 * without one — which makes "add" the common case, not "change", and the
 * circle itself is the target for both.
 */
export function AvatarForm({
  currentSrc,
  initials,
}: {
  /** signed URL of the stored picture, or null if there isn't one */
  currentSrc: string | null;
  initials: string;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  // Object URLs are held by the browser until explicitly released; without
  // this, picking several photos in a row leaks one blob each time.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    // Reset so choosing the *same* file again still fires a change event.
    e.target.value = "";
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setError("That image is over 2 MB. Try a smaller one.");
      return;
    }
    setError(null);
    setSaved(false);
    setFile(f);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(f);
    });
  }

  function discard() {
    setFile(null);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    setError(null);
  }

  function save() {
    if (!file) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.append("avatar", file);
      const result = await saveAvatar(fd);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      discard();
      setSaved(true);
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await removeAvatar();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      discard();
      setSaved(false);
      router.refresh();
    });
  }

  const shown = preview ?? currentSrc;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-4">
      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        disabled={pending}
        className="group relative grid size-20 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-full border border-line bg-muted text-muted-foreground transition-colors hover:border-ok focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ok disabled:opacity-50"
        aria-label={shown ? "Change your profile picture" : "Add a profile picture"}
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt="" className="size-full object-cover" />
        ) : initials ? (
          <span className="font-heading text-xl">{initials}</span>
        ) : (
          <Camera className="size-6" />
        )}
        <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/45 text-[10px] font-semibold tracking-wide text-white opacity-0 transition-opacity group-hover:opacity-100">
          {shown ? "CHANGE" : "ADD"}
        </span>
      </button>

      <div className="min-w-0 space-y-2">
        <p className="text-sm text-muted-foreground">
          {preview
            ? "This is how it will look. Save it to keep it."
            : "Optional. JPG, PNG or WebP, up to 2 MB."}
        </p>

        <div className="flex flex-wrap gap-2">
          {preview ? (
            <>
              <Button type="button" size="sm" onClick={save} disabled={pending}>
                {pending ? "Saving…" : "Save photo"}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={discard} disabled={pending}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button" size="sm" variant="outline" disabled={pending}
                onClick={() => fileInput.current?.click()}
              >
                {currentSrc ? "Change photo" : "Add a photo"}
              </Button>
              {currentSrc && (
                <Button type="button" size="sm" variant="outline" onClick={remove} disabled={pending}>
                  {pending ? "Removing…" : "Remove"}
                </Button>
              )}
            </>
          )}
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
        {saved && !error && <p className="text-sm text-ok">Photo saved.</p>}
      </div>

      <input
        ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp"
        onChange={pick} className="sr-only" tabIndex={-1}
      />
    </div>
  );
}
