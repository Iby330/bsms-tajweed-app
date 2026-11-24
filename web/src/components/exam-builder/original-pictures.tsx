/**
 * "See the original picture": the screenshot a question's Arabic came from,
 * kept for checking after its words were typeset from the mushaf data (or a
 * slide title was typed in). Shown only when some picture is not on screen.
 * `imageUrls` already holds the originals (queries sign them from
 * ayah-proposals), so nothing is fetched here. Plain <details>, no hooks:
 * it works in the server-rendered review page and the client editor alike.
 */
import type { McqOption, QuranRef } from "@/lib/exam-builder/types";

type Q = { prompt_quran: QuranRef | null; prompt_images: string[]; options: McqOption[] | null; imageUrls: Record<string, string> };

/** Pictures not on screen: typeset over by a ref, or (a slide title) no longer in the question. */
export function hiddenOriginals(q: Q): string[] {
  const own = q.prompt_images.filter(Boolean);
  const hidden = new Set<string>();
  if (q.prompt_quran) own.forEach((p) => hidden.add(p));
  for (const o of q.options ?? []) if (o.image && o.quran) hidden.add(o.image);
  const shown = new Set([...own, ...(q.options ?? []).flatMap((o) => (o.image ? [o.image] : []))]);
  for (const p of Object.keys(q.imageUrls)) if (!shown.has(p)) hidden.add(p);
  return [...hidden].filter((p) => q.imageUrls[p]);
}

export function OriginalPictures({ question, className }: { question: Q; className?: string }) {
  const paths = hiddenOriginals(question);
  if (paths.length === 0) return null;
  return (
    <details className={className ? `group text-xs ${className}` : "group text-xs"}>
      <summary className="w-fit cursor-pointer rounded-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        {paths.length === 1 ? "See the original picture" : `See the ${paths.length} original pictures`}
      </summary>
      <div className="mt-2 flex flex-wrap items-start gap-2">
        {paths.map((p) => (
          // Signed, short-lived storage URLs: next/image would cache them past expiry.
          // eslint-disable-next-line @next/next/no-img-element
          <img key={p} src={question.imageUrls[p]} alt="The original picture of this Arabic" loading="lazy"
            className="max-h-28 max-w-full rounded border border-line bg-white p-1" title={p} />
        ))}
      </div>
    </details>
  );
}
