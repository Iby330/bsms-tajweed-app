import Link from "next/link";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ProgressBar } from "@/components/app/progress-bar";
import { fmtDay } from "@/lib/format";
import { thumbnailUrl } from "@/lib/lessons/youtube";
import type { CourseBlock } from "@/lib/curriculum/catalogue";
import { cn } from "@/lib/utils";

/**
 * Where a course's cover art lives: web/public/courses/<slug>.(jpg|png|webp).
 *
 * Checked on disk rather than rendered blind. A missing <img> is a broken icon
 * and a layout that jumps; the branded plate below is a deliberate state that
 * looks like part of the design, so the page is presentable before any art
 * exists and improves silently as each file lands. Server component, so this
 * costs a stat call per tile and never runs in the browser.
 */
const COVERS = join(process.cwd(), "public", "courses");
function coverSrc(slug: string): string | null {
  for (const ext of ["jpg", "png", "webp"]) {
    if (existsSync(join(COVERS, `${slug}.${ext}`))) return `/courses/${slug}.${ext}`;
  }
  return null;
}

/**
 * One topic block as a square: cover, name, what it is, and where you are in it.
 *
 * Open: it links through and carries progress, because the question a student
 * opens the index with is "where was I". Locked: no link, and it says WHY in the
 * line where progress would have been — a date if it is coming to them, plain
 * words if it is not. A padlock with no explanation is a wall; the locked half
 * of this page exists to show how much more there is, so each square has to be
 * legible from the outside.
 */
export function CourseTile({
  block,
  href,
  reason,
  progress,
  note,
}: {
  block: CourseBlock;
  /** Null renders the square as locked and unclickable. */
  href: string | null;
  /** Why it is shut. Only read when href is null. */
  reason?: "later" | "not-running";
  /** Modules done / modules with something in them. Open blocks only. */
  progress?: { done: number; total: number };
  /** Replaces the progress line. The teacher's index counts content, not
   *  completion — "8 modules · 6 with video" is what they need to see. */
  note?: string;
}) {
  // Three covers, in order of preference: art you have supplied, else the
  // opening lesson's poster frame — which is why the student module cards look
  // right and these did not — else the branded plate. The poster is withheld
  // from a locked block, since its content is not the reader's to see.
  const src = coverSrc(block.slug) ?? (href ? thumbnailUrl(block.posterId) : null);
  const shape = block.moduleCount
    ? `${block.moduleCount} ${block.moduleCount === 1 ? "module" : "modules"}` +
      (block.termId ? ` · Term ${block.termId}` : "") +
      (block.hasHomework ? " · video + homework" : " · video only")
    : "Not running this year";

  const body = (
    <>
      <div className="cover">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" width={1280} height={720} loading="lazy" />
        ) : (
          <span className="plate">
            {block.parentLabel && <b>{block.parentLabel}</b>}
            <i>{block.label}</i>
          </span>
        )}
      </div>

      <div className="tbody">
        {block.parentLabel && <span className="label">{block.parentLabel}</span>}
        <h2>{block.label}</h2>
        <p className="mt-2 text-xs text-muted-foreground">{shape}</p>

        <div className="mt-auto pt-4">
          {href && note ? (
            <p className="text-xs text-muted-foreground">{note}</p>
          ) : href && progress ? (
            <>
              <ProgressBar
                done={progress.done}
                total={progress.total}
                emptyNote="Waiting on videos"
                label={`${block.label}: ${progress.done} of ${progress.total} modules complete`}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {progress.total === 0
                  ? "Nothing to do here yet"
                  : progress.done >= progress.total
                    ? <span className="text-ok">All caught up ✓</span>
                    : `${progress.total - progress.done} left to do`}
              </p>
            </>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span aria-hidden>🔒</span>
              {reason === "later" && block.opensAt
                ? `Opens ${fmtDay(block.opensAt)}`
                : block.moduleCount > 0
                  ? "Another class is studying this"
                  : "Not taught this year"}
            </p>
          )}
        </div>
      </div>
    </>
  );

  if (!href) {
    return (
      <div className="tcard cover-card locked" aria-label={`${block.label} — locked`}>
        {body}
      </div>
    );
  }
  return (
    <Link href={href} className={cn("tcard cover-card", !block.fullyOpen && "current")}>
      {body}
    </Link>
  );
}
