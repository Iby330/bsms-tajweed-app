import { buildPaperDocx, readImageSize, type DocxImage } from "@/lib/exam-builder/docx";
import { collectImagePaths } from "@/lib/exam-builder/images";
import { namedTitle } from "@/lib/exam-builder/labels";
import { loadPaper } from "@/lib/exam-builder/queries";
import { loadQuranSnippets } from "@/lib/exam-builder/quran";
import { questionRefs, readableText } from "@/lib/exam-builder/quran-lines";
import type { Paper } from "@/lib/exam-builder/types";
import { currentProfile, supabaseServer } from "@/lib/supabase/server";

/**
 * The exam paper as a Word document: GET /api/exam-builder/<paperId>/docx,
 * or the mark scheme with `?scheme=1`. Same content as the print view
 * (app/exam-print/[paperId]); the layout is lib/exam-builder/docx.ts.
 *
 * Teachers only. Which papers a teacher may export is row level security's
 * call, through `loadPaper` and the caller's own client: their own papers,
 * every paper for an admin, and anything else is a 404, not a 403, so a paper
 * id says nothing about whether it exists.
 *
 * The pictures come from the private exam-questions bucket on the server, as
 * the caller, and go into the file itself: a Word file cannot point at a
 * signed URL that dies in two hours. A picture that will not download, or is
 * not a PNG, JPEG or GIF, prints "[picture missing]" instead of failing the
 * whole export.
 */

// Node, not edge: docx packs the file with Node's Buffer. Never cached: it is
// one teacher's paper, read with their cookies.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "exam-questions";
/** Storage downloads in flight at once: a 50-question paper has as many pictures. */
const CONCURRENCY = 6;

const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function GET(request: Request, { params }: { params: Promise<{ paperId: string }> }) {
  const profile = await currentProfile();
  if (!profile) return Response.json({ error: "Not signed in." }, { status: 401 });
  if (profile.role !== "teacher") return Response.json({ error: "Teachers only." }, { status: 403 });

  const { paperId } = await params;
  const scheme = new URL(request.url).searchParams.get("scheme") === "1";

  let loaded;
  try {
    loaded = await loadPaper(paperId);
  } catch {
    return Response.json({ error: "Couldn't load the paper. Try again." }, { status: 500 });
  }
  if (!loaded) return Response.json({ error: "No such paper." }, { status: 404 });
  const { paper, sections, items } = loaded;

  const paths = [...new Set(items.flatMap(collectImagePaths))];
  // The Qur'an words named by refs, as text; a range that fails to load
  // prints its picture instead (docx.ts).
  const [images, snippets, arabicFont] = await Promise.all([
    downloadImages(paths),
    loadQuranSnippets(items.flatMap(questionRefs)).catch(() => ({})),
    arabicFontFor(request),
  ]);
  const quranText = Object.fromEntries(Object.entries(snippets).map(([key, words]) => [key, readableText(words)]));

  let bytes: Uint8Array;
  try {
    bytes = await buildPaperDocx({ paper, sections, items, images, scheme, quranText, arabicFont });
  } catch {
    return Response.json({ error: "Couldn't build the Word file." }, { status: 500 });
  }

  const { ascii, full } = fileNames(paper, scheme);
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": DOCX_TYPE,
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeRfc5987(full)}`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "no-store",
    },
  });
}

/** Each picture's bytes and size, path → image. Failures are left out. */
/**
 * The app's Uthmanic Hafs font, to carry inside the file so Word shows it on
 * any machine. Fetched from the site's own /fonts (a public, CDN-served file;
 * no filesystem to trace into the function) and kept for the warm instance.
 * Without it the file still builds and Word uses its own Arabic face.
 */
let arabicFontBytes: Promise<Uint8Array | undefined> | null = null;
function arabicFontFor(request: Request): Promise<Uint8Array | undefined> {
  arabicFontBytes ??= fetch(new URL("/fonts/uthmanic_hafs_v22.ttf", request.url))
    .then(async (res) => (res.ok ? new Uint8Array(await res.arrayBuffer()) : undefined))
    .catch(() => undefined)
    .then((bytes) => {
      if (!bytes) arabicFontBytes = null; // try again next time
      return bytes;
    });
  return arabicFontBytes;
}

async function downloadImages(paths: string[]): Promise<Record<string, DocxImage>> {
  const out: Record<string, DocxImage> = {};
  if (paths.length === 0) return out;
  const db = await supabaseServer();
  let next = 0;
  async function worker() {
    while (next < paths.length) {
      const path = paths[next++];
      try {
        const { data, error } = await db.storage.from(BUCKET).download(path);
        if (error || !data) continue;
        const bytes = new Uint8Array(await data.arrayBuffer());
        const size = readImageSize(bytes);
        if (size) out[path] = { data: bytes, ...size };
      } catch {
        // Left out: the document prints "[picture missing]" in its place.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, paths.length) }, worker));
  return out;
}

/**
 * `EOT1-26-27-paper.docx` / `EOT1-26-27-mark-scheme.docx` for the plain
 * `filename`, from the paper's code and season (else its title), with the
 * paper's name when it has one (`EOT1-26-27-Advanced-paper.docx`); the full
 * title and name, as the print view names its PDF, for `filename*`.
 */
function fileNames(paper: Paper, scheme: boolean): { ascii: string; full: string } {
  const tag = [paper.code.trim(), paper.season.trim()].filter(Boolean).join(" ");
  const stem = [asciiSlug(tag) || asciiSlug(paper.title) || "exam", asciiSlug(paper.name)].filter(Boolean).join("-");
  const suffix = scheme ? "mark-scheme" : "paper";
  const full = [namedTitle(paper), tag, scheme ? "Mark scheme" : "Paper"]
    .filter(Boolean)
    .join(" — ")
    // No path separators or characters Windows refuses in a file name.
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-");
  return { ascii: `${stem}-${suffix}.docx`, full: `${full}.docx` };
}

function asciiSlug(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** RFC 5987 value: encodeURIComponent leaves ' ( ) * unescaped, which the grammar does not allow. */
function encodeRfc5987(s: string): string {
  return encodeURIComponent(s).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}
