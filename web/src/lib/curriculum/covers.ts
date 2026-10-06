import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Where a course's cover art lives: web/public/courses/<slug>.(jpg|png|webp).
 *
 * Checked on disk rather than rendered blind. A missing <img> is a broken icon
 * and a layout that jumps; the branded plate is a deliberate state that looks
 * like part of the design, so a page is presentable before any art exists and
 * improves silently as each file lands. Server components only: this is a stat
 * call per tile and never runs in the browser.
 */
const COVERS = join(process.cwd(), "public", "courses");

/**
 * Art that ships in the repo, named outright as well. On Netlify the CDN
 * serves web/public and a server function's own filesystem need not hold it,
 * so the disk check alone could find nothing in production and quietly fall
 * back to the plate. A file committed here is a line here.
 */
const SHIPPED: Record<string, string> = {
  qaidah: "/courses/qaidah.png",
};

export function coverSrc(slug: string): string | null {
  if (SHIPPED[slug]) return SHIPPED[slug];
  for (const ext of ["jpg", "png", "webp"]) {
    if (existsSync(join(COVERS, `${slug}.${ext}`))) return `/courses/${slug}.${ext}`;
  }
  return null;
}
