import Link from "next/link";
import { ProgressBar } from "@/components/app/progress-bar";
import { fmtDay, fmtStamp } from "@/lib/format";
import { thumbnailUrl } from "@/lib/lessons/youtube";
import type { TermTile as Tile } from "@/lib/curriculum/catalogue";
import { cn } from "@/lib/utils";

/**
 * One term of the student's year. Open: the heading links to the term, and
 * each course that has started links straight to itself, so reaching a
 * course is no more clicks than it was. Not open: no link anywhere, the
 * courses named as plain text and the date it opens. A course is a link only
 * when termIndex gave it an href, which is only when something in it is open.
 *
 * A linked term is clickable all over: the heading's link is stretched across
 * the card (CSS, `.term-card.linked`), and the course links sit above it, so
 * a click on Ghunna still opens Ghunna and anywhere else opens the term.
 *
 * Kept a server component (no hooks), so the heading id is derived from
 * tile.id rather than generated with useId.
 */
export function TermTile({ tile }: { tile: Tile }) {
  const heading = `Term ${tile.id}`;
  const headingId = `term-${tile.id}`;
  return (
    <article
      className={cn("tcard cover-card term-card", tile.href && "linked", tile.isCurrent && "current", !tile.open && "locked")}
      aria-labelledby={headingId}
    >
      {/* The term's own videos as its cover, one or two side by side; with
          none, the plate the course tiles use. */}
      <div className={cn("cover", tile.posters.length > 1 && "duo")}>
        {tile.posters.length > 0 ? (
          tile.posters.map((id) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={id} src={thumbnailUrl(id)!} alt="" width={480} height={360} loading="lazy" />
          ))
        ) : (
          <span className="plate"><i>{heading}</i></span>
        )}
      </div>

      <div className="tbody">
        {/* startsOn/endsOn are Postgres `date` columns — fmtDay, not a local
            Date format, or the range shows a day early west of Greenwich. */}
        <span className="label">{fmtDay(tile.startsOn)} – {fmtDay(tile.endsOn)}</span>
        <h2 id={headingId}>
          {tile.href ? <Link href={tile.href}>{heading}</Link> : heading}
          {!tile.open && <span className="sr-only">, locked</span>}
        </h2>

        {tile.courses.length > 0 && (
          <ul className="term-courses">
            {tile.courses.map((c) => (
              <li key={c.key}>
                {c.href ? <Link href={c.href}>{c.label}</Link> : <span>{c.label}</span>}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto pt-4">
          {tile.open && tile.progress ? (
            <>
              <ProgressBar
                done={tile.progress.done}
                total={tile.progress.total}
                emptyNote="Waiting on videos"
                label={`${heading}: ${tile.progress.done} of ${tile.progress.total} modules complete`}
              />
              {tile.isCurrent && <span className="label mt-2 inline-block">Current term</span>}
            </>
          ) : tile.opensAt ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span aria-hidden>🔒</span>
              {/* opensAt is a timestamptz — fmtStamp renders it in the school's
                  own zone, so a London-midnight unlock never reads a day early. */}
              Opens {fmtStamp(tile.opensAt)}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
