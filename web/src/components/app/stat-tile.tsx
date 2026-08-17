import Link from "next/link";
import { cn } from "@/lib/utils";

export function StatTile({
  label, value, sub, className, href,
}: {
  label: string;
  value: string | number | null | undefined;
  sub?: string;
  className?: string;
  /** Turns the whole tile into a link. Same markup and classes either way —
   *  only the element changes, so an unlinked tile is byte-identical to what
   *  it was before. */
  href?: string;
}) {
  const empty = value === null || value === undefined || value === "";
  const body = (
    <>
      <span className="label">{label}</span>
      <div className="stat">
        <span className={cn("v sm", empty && "opacity-40")}>{empty ? "—" : value}</span>
      </div>
      {sub && <div className="note">{empty ? "no data yet" : sub}</div>}
    </>
  );

  if (!href) return <div className={cn("box c4", className)}>{body}</div>;

  // `.box` already carries a hover background, so the only thing a linked tile
  // adds is the focus ring — without it the tile is reachable by keyboard and
  // gives no sign of it.
  return (
    <Link
      href={href}
      className={cn(
        "box c4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        className,
      )}
    >
      {body}
    </Link>
  );
}
