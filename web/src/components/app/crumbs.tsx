import Link from "next/link";

/** Breadcrumb for the course drill-down. The last item is the current page
 *  and never links — it marks where you are, not where you can go. */
export function Crumbs({
  items,
}: {
  items: { label: string; href?: string }[];
}) {
  return (
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
                <span aria-current={last ? "page" : undefined} className={last ? "text-foreground" : undefined}>
                  {item.label}
                </span>
              )}
              {!last && <span aria-hidden className="text-muted-foreground/50">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
