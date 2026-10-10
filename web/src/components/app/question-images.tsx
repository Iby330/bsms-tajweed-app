import type { QuestionImage } from "@/lib/homework/media";
import { cn } from "@/lib/utils";

/**
 * The pictures a question carries, under its prompt: a page of the Qāʿidah
 * book whose boxes the student reads out. Full width and in order, each one
 * opening at full size in a new tab, since a phone shrinks a whole book page
 * to letters too small to name.
 */
export function QuestionImages({ images, className }: { images: QuestionImage[]; className?: string }) {
  if (!images.length) return null;
  return (
    <div className={cn("space-y-3", className)}>
      {images.map((img) => (
        <a key={img.src} href={img.src} target="_blank" rel="noopener" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={img.src}
            alt={img.alt}
            width={img.width}
            height={img.height}
            loading="lazy"
            className="h-auto w-full rounded-md border border-line bg-page"
          />
        </a>
      ))}
      <p className="text-xs text-muted-foreground">Tap a page to open it full size.</p>
    </div>
  );
}
