/**
 * A question's prompt and its options, shared by the builder (screen) and the
 * printed paper (print). Purely presentational: no "use client", no hooks, so
 * a server component and a client component can both render it.
 *
 * Pictures are the Arabic as it appeared in the source document, by storage
 * path; `imageUrls` maps each path to a signed URL (lib/exam-builder/images).
 * A path with no URL shows a small "Picture missing" on screen and nothing in
 * print, so a broken image never reaches a student's paper.
 *
 * Typeset wins: when the prompt (`quran`) or an option (`option.quran`) names
 * Qur'an words and a `renderQuran` is given, the words are typeset in place of
 * the picture. The picture is handed to `renderQuran` as the fallback, shown
 * only if the words cannot be had. Screen and print pass their own renderer
 * (typeset-ayah's `screenQuran`, the print page's server-loaded words).
 * Part of an ayah never gets a "(Surah, ayah)" label: see `refLabel`.
 *
 * The `exam-q-*` class names are hooks for the print stylesheet.
 */
import type { ReactNode } from "react";
import { MixedText } from "@/components/app/mixed-text";
import { refLabel } from "@/lib/exam-builder/quran-lines";
import type { McqOption, QuranRef } from "@/lib/exam-builder/types";

type Variant = "screen" | "print";

const ALT = "Arabic text for this question";

/** Typesets `ref` where the picture would be, or returns `fallback` (the picture) when it cannot. */
export type RenderQuran = (ref: QuranRef, fallback: ReactNode, where: "prompt" | "option") => ReactNode;

function Picture({ path, url, variant }: { path: string; url: string | undefined; variant: Variant }) {
  if (!url) {
    if (variant === "print") return null;
    return (
      <span
        className="exam-q-missing inline-flex items-center rounded border border-dashed border-border px-2 py-1 text-xs text-muted-foreground"
        title={path}
      >
        Picture missing
      </span>
    );
  }
  return (
    // Signed, short-lived storage URLs: next/image would cache them past expiry.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={ALT}
      loading={variant === "screen" ? "lazy" : undefined}
      className="exam-q-image block h-auto w-auto"
      // On screen the context sets the cap (exam-builder.css: one line on the
      // sheet, smaller in a bank card) and fit-pictures refines it by lines.
      style={{ maxWidth: "100%", maxHeight: variant === "print" ? "32mm" : "var(--exam-pic-max, 9rem)" }}
    />
  );
}

export function QuestionPrompt({
  prompt,
  images,
  imageUrls,
  quran,
  renderQuran,
  variant,
}: {
  prompt: string;
  images: string[];
  imageUrls: Record<string, string>;
  quran?: QuranRef | null;
  /** Typesets `quran` in place of the pictures; without it the pictures show. */
  renderQuran?: RenderQuran;
  variant: Variant;
}) {
  const pictures = images.filter(Boolean);
  const label = quran ? refLabel(quran) : null;
  const fallback =
    pictures.length > 0 ? (
      <div className="exam-q-images flex flex-col items-start gap-2">
        {pictures.map((path, i) => (
          <Picture key={`${path}-${i}`} path={path} url={imageUrls[path]} variant={variant} />
        ))}
      </div>
    ) : label ? (
      <p className={variant === "screen" ? "exam-q-ref text-xs text-muted-foreground" : "exam-q-ref text-sm"}>({label})</p>
    ) : null;
  return (
    <div className="exam-q-prompt space-y-2" data-variant={variant}>
      <p className="whitespace-pre-line">
        {/* "auto": an ayah typed into the question is Qur'an; a bare term ("What does ياء النداء mean?") is not. */}
        <MixedText text={prompt} variant="auto" />
      </p>
      {quran && renderQuran ? <div className="exam-q-quran">{renderQuran(quran, fallback, "prompt")}</div> : fallback}
    </div>
  );
}

/** A tick box drawn as a bordered square: a picture of a form control, not one. */
function TickBox({ ticked }: { ticked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="exam-q-box mt-[0.2em] inline-flex size-[1em] shrink-0 items-center justify-center border border-current text-[0.85em] leading-none"
    >
      {ticked ? "✓" : ""}
    </span>
  );
}

export function OptionList({
  options,
  imageUrls,
  showCorrect,
  renderQuran,
  variant,
}: {
  options: McqOption[];
  imageUrls: Record<string, string>;
  /** Mark scheme: tick and embolden the correct option(s). */
  showCorrect: boolean;
  /** Typesets an option's `quran` in place of its picture. */
  renderQuran?: RenderQuran;
  variant: Variant;
}) {
  return (
    <ul className="exam-q-options space-y-1.5" data-variant={variant}>
      {options.map((o, i) => {
        const ticked = showCorrect && o.correct;
        const picture = o.image ? <Picture path={o.image} url={imageUrls[o.image]} variant={variant} /> : null;
        return (
          <li key={i} className={ticked ? "flex items-start gap-2 font-bold" : "flex items-start gap-2"}>
            <TickBox ticked={ticked} />
            <span className="min-w-0 flex-1 space-y-1">
              {o.text ? <MixedText text={o.text} variant="quran" className="block" /> : null}
              {o.quran && renderQuran ? <span className="exam-q-option-quran block">{renderQuran(o.quran, picture, "option")}</span> : picture}
              {ticked ? <span className="sr-only"> (correct answer)</span> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
