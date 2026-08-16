import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * Breadcrumb for the course drill-down. The last item is the current page and
 * never links: it marks where you are, not where you can go.
 *
 * Above the trail sits a plain Back link to the level directly above. The
 * trail can already be clicked, but reading a path and picking the right
 * segment is a different act from simply going back one step, and the second
 * is what most people want. It is derived from the trail rather than passed
 * in, so every page using Crumbs gets it without being asked.
 */
export function Crumbs({
  items,
}: {
  items: { label: string; href?: string }[];
}) {
  // The nearest ancestor that can actually be navigated to. Not simply
  // items[length - 2]: a middle crumb may have no href, in which case the
  // step up is whichever one before it does.
  const parent = items.slice(0, -1).filter((i) => i.href).at(-1);

  return (
    <div className="trail">
      {parent?.href && (
        <Link href={parent.href} className="backstep">
          <ArrowLeft className="size-[13px]" aria-hidden />
          Back to {parent.label}
        </Link>
      )}

      <nav aria-label="Breadcrumb">
        <ol className="crumbs flex flex-wrap items-center gap-1.5">
          {items.map((item, i) => {
            const last = i === items.length - 1;
            return (
              <li key={`${item.label}-${i}`} className="flex items-center gap-1.5">
                {item.href && !last ? (
                  <Link
                    href={item.href}
                    className="rounded transition-colors hover:text-foreground hover:underline underline-offset-4"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span
                    aria-current={last ? "page" : undefined}
                    className={last ? "text-foreground" : undefined}
                  >
                    {item.label}
                  </span>
                )}
                {!last && <span aria-hidden className="text-muted-foreground/50">/</span>}
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
