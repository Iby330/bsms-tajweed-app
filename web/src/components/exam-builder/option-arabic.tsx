"use client";

/**
 * Arabic in an answer option: none, a picture, or words typeset from the
 * mushaf ("Which of these has idghaam?" with a word in each option). Shared
 * by the question editor and "Write a new question".
 *
 * The form holds each option with its `arabic` state; `readOption` turns it
 * back into what is saved. A typeset option keeps any picture it had as the
 * fallback, shown only if the words cannot load.
 */
import { useRef, useState } from "react";
import { ImageOff, ImagePlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { draftFromRef, readDraft, type RefDraft } from "@/lib/exam-builder/quran-ref-draft";
import type { McqOption, QuranRef } from "@/lib/exam-builder/types";
import { cn } from "@/lib/utils";
import { QuranRefFields, type ArabicMode } from "./arabic-choice";
import { PICTURE_ACCEPT, uploadPicture } from "./upload-picture";

export type OptionArabicState = { mode: ArabicMode; draft: RefDraft; had: QuranRef | null };
export type FormOption = McqOption & { arabic: OptionArabicState };

export function toFormOption(o: McqOption): FormOption {
  return {
    ...o,
    arabic: { mode: o.quran ? "typeset" : o.image ? "picture" : "none", draft: draftFromRef(o.quran), had: o.quran ?? null },
  };
}

export const blankOption = (): FormOption => toFormOption({ text: "", image: null, correct: false });

/** The same range as `b`, ignoring its marks. */
const sameRange = (a: QuranRef, b: QuranRef) =>
  a.surah === b.surah && a.from_ayah === b.from_ayah && a.to_ayah === b.to_ayah && a.from_word === b.from_word && a.to_word === b.to_word;

/** A typed ref keeps the basmala and circle the copy had, when it names the same range. */
export function keepMarks(ref: QuranRef, had: QuranRef | null): QuranRef {
  if (!had || !sameRange(ref, had)) return ref;
  return { ...ref, ...(had.basmala ? { basmala: true } : null), ...(had.circle ? { circle: had.circle } : null) };
}

/** The option as saved, or why its typeset words do not make an ayah range. */
export function readOption(o: FormOption, n: number): { ok: true; option: McqOption } | { ok: false; error: string } {
  const base: McqOption = { text: o.text, image: o.image, correct: o.correct };
  if (o.arabic.mode === "none") return { ok: true, option: { ...base, image: null } };
  if (o.arabic.mode === "picture") return { ok: true, option: base };
  const read = readDraft(o.arabic.draft);
  if (!read.ok) return { ok: false, error: `Option ${n}, typeset ayah: ${read.error}` };
  return { ok: true, option: { ...base, quran: keepMarks(read.ref, o.arabic.had) } };
}

const MODES: [ArabicMode, string][] = [["none", "No Arabic"], ["picture", "Picture"], ["typeset", "Typeset"]];

export function OptionArabic({
  option, n, idPrefix, profileId, imageUrls, onChange, onUploaded,
}: {
  option: FormOption;
  n: number;
  idPrefix: string;
  profileId: string;
  imageUrls: Record<string, string>;
  onChange: (patch: Partial<FormOption>) => void;
  /** A new picture's signed URL, so it shows before the save. */
  onUploaded: (path: string, url: string) => void;
}) {
  const { mode, draft } = option.arabic;
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const setArabic = (patch: Partial<OptionArabicState>) => onChange({ arabic: { ...option.arabic, ...patch } });

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setUploading(true);
    const r = await uploadPicture(file, profileId);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    if (!r.ok) return setError(r.error);
    onUploaded(r.path, r.url);
    onChange({ image: r.path });
  };

  const url = option.image ? imageUrls[option.image] : undefined;

  return (
    <div className="grid gap-2">
      <div role="radiogroup" aria-label={`Arabic in option ${n}`} className="inline-flex w-fit overflow-hidden rounded-md border border-line text-xs">
        {MODES.map(([m, label]) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => { setArabic({ mode: m }); setError(null); }}
            className={cn(
              "min-h-7 px-2.5 font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
              mode === m ? "bg-[color-mix(in_oklab,var(--brand)_28%,var(--card))] text-foreground" : "bg-card text-muted-foreground hover:bg-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "picture" && (
        option.image ? (
          <div className="flex flex-wrap items-start gap-2">
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={`The picture in option ${n}`} className="max-h-20 max-w-full rounded border border-line bg-white sm:max-w-[14rem]" />
            ) : (
              <span className="rounded border border-dashed border-line px-2 py-1 text-xs text-muted-foreground">Picture missing</span>
            )}
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-danger" onClick={() => onChange({ image: null })} aria-label={`Remove the picture in option ${n}`}>
              <ImageOff aria-hidden /> Remove picture
            </Button>
          </div>
        ) : (
          <div>
            <input ref={fileRef} type="file" accept={PICTURE_ACCEPT} className="sr-only" onChange={(e) => upload(e.target.files?.[0])} disabled={uploading} aria-label={`Picture for option ${n}`} tabIndex={-1} />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="animate-spin" aria-hidden /> : <ImagePlus aria-hidden />}
              {uploading ? "Uploading…" : "Add a picture"}
            </Button>
            <span className="ml-2 text-xs text-muted-foreground">PNG, JPEG, WebP or GIF, up to 3 MB.</span>
          </div>
        )
      )}

      {mode === "typeset" && (
        <div className="rounded-md border border-line bg-muted/30 p-2.5">
          <QuranRefFields draft={draft} onChange={(d) => setArabic({ draft: d })} showErrors={false} idPrefix={`${idPrefix}-opt${n}`} />
        </div>
      )}

      {error && <p className="text-xs text-danger" role="alert">{error}</p>}
    </div>
  );
}
