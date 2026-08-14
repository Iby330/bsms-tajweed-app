import { fmtDay } from "@/lib/format";
import { MixedText } from "@/components/app/mixed-text";

export type RecordEntry = {
  number: number;
  name_en: string;
  name_ar: string;
  passed_at: string;
  teacher_comment: string | null;
};

/**
 * "Your record" — the one place teacher comments appear in full. Entries
 * arrive most-recent-first; the two newest always show, the rest sit behind
 * a native <details> (no client JS). Renders nothing before the first pass.
 */
export function HifzRecord({ entries }: { entries: RecordEntry[] }) {
  if (entries.length === 0) return null;
  const preview = entries.slice(0, 2);
  const rest = entries.slice(2);
  return (
    <section aria-labelledby="hifz-record-heading" className="box c12">
      <h2 id="hifz-record-heading" className="text-sm font-medium">Your record</h2>
      <ul className="mt-3 space-y-3">
        {preview.map((e) => (
          <RecordRow key={e.number} e={e} />
        ))}
      </ul>
      {rest.length > 0 && (
        <details className="group mt-3 border-t border-line pt-3">
          <summary className="cursor-pointer list-none rounded-md text-center text-xs font-medium text-ok focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Show all {entries.length} <span aria-hidden>▾</span></span>
            <span className="hidden group-open:inline">Show fewer <span aria-hidden>▴</span></span>
          </summary>
          <ul className="mt-3 space-y-3">
            {rest.map((e) => (
              <RecordRow key={e.number} e={e} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function RecordRow({ e }: { e: RecordEntry }) {
  return (
    <li className="border-l-2 border-line pl-3">
      <p className="text-sm">
        <span className="font-medium">{e.name_en}</span>{" "}
        <span dir="rtl" lang="ar" className="ar-ui text-muted-foreground">
          {e.name_ar}
        </span>
        <span className="ml-2 text-xs tabular-nums text-muted-foreground">
          passed {fmtDay(e.passed_at)}
        </span>
      </p>
      {e.teacher_comment && (
        <MixedText
          text={e.teacher_comment}
          className="mt-1 block break-words rounded-md bg-muted px-2.5 py-1.5 text-xs text-ink-2"
        />
      )}
    </li>
  );
}
