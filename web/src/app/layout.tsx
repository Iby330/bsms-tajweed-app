import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Sans_Arabic, Amiri_Quran, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { headers } from "next/headers";
import { SURFACE_HEADER } from "@/lib/theme/surface";
import "./globals.css";

// No `weight`: that pins the download to fixed cuts, and the 2026 design
// runs from 200 (display figures, the masthead) to 700 (emphasis). Omitting
// it ships the variable axis, so every weight in between actually renders
// instead of silently snapping to the nearest cut that was downloaded.
// `latin-ext` is not optional here. The plain `latin` subset stops at U+00FF,
// and the curriculum is full of transliteration above it — Ṣifāt (U+1E62),
// Mudūd (U+016B), Mabādi', Ḥurūf. Without it those characters fall back to a
// system font mid-word, which reads as a rendering fault rather than a
// different typeface. `latin-ext` covers U+0100–02BA and U+1E00–1E9F, which
// is all of them. next/font emits it as a separate file behind a
// unicode-range, so pages with no such character never download it.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin", "latin-ext"],
});

const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-plex-arabic",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
});

const amiriQuran = Amiri_Quran({
  variable: "--font-amiri-quran",
  subsets: ["arabic"],
  weight: "400",
});

// Geist Mono has NO Latin Extended at all — not ā, not ū, not ṣ, not ṭ. A
// `latin-ext` subset does not help, because Google cannot serve a subset the
// face does not contain. The labels are exactly where this programme's
// vocabulary lands — FĀṬIR 35:33, ṢIFĀT, MUDŪD — so those glyphs have to come
// from somewhere else, and --font-mono names Archivo next (see globals.css).
//
// globals.css therefore names "Geist Mono" directly rather than reading this
// variable: next/font packs a metric-matched "Geist Mono Fallback" inside it,
// which is local Arial with no unicode-range, and it answers for every missing
// glyph before any later family is reached. That is what set the Ṭ in Arial.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Needed by /apply, whose openGraph image is a relative path: without a base
  // Next emits it relative and WhatsApp, which fetches the preview from its
  // own servers with no page context, resolves it to nothing and shows a card
  // with no picture. The custom domain, not the netlify.app one — that
  // 307-redirects here.
  metadataBase: new URL("https://www.bsmstajweed.com"),
  title: { default: "BSMS Tajweed", template: "%s · BSMS Tajweed" },
  description:
    "Tajweed and Qur'an memorisation platform for the Brighton Sussex Muslim Students programme.",
};

/**
 * The browser chrome around the page — the address bar on mobile, the title
 * bar of an installed window. Two values so it follows the theme rather than
 * leaving a pale strip above a dark page.
 *
 * This is the one part of the scheme that CANNOT key off data-brand: it is
 * static metadata, read before any CSS runs. So unlike globals.css these are
 * edited in place, and the cream values are kept here to switch back to:
 *
 *   cream light  #f4f1df      cream dark  #0a0a08
 */
export async function generateViewport(): Promise<Viewport> {
  // On a screen pinned to the dark scheme the browser chrome has to be pinned
  // with it. Left keyed to prefers-color-scheme, a light-mode phone would draw
  // a pale address bar directly above a navy page — the exact strip this
  // export exists to prevent, just the other way round.
  if ((await headers()).get(SURFACE_HEADER) === "dark-only") {
    return { themeColor: "#00004d" };
  }
  return {
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: "#ededfc" },
      { media: "(prefers-color-scheme: dark)", color: "#00004d" },
    ],
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  /**
   * The signed-out screens are pinned to the dark scheme; the app follows the
   * viewer. The proxy decides which this is and says so on the request, because
   * a layout cannot see its own route — see lib/theme/surface.ts.
   *
   * Both halves are needed. `dark` on <html> is what the server sends, so the
   * page paints navy immediately; `forcedTheme` is what stops next-themes
   * replacing it with the system scheme the moment it hydrates. One without the
   * other is either a flash of white or a page that quietly reverts.
   */
  const darkOnly = (await headers()).get(SURFACE_HEADER) === "dark-only";

  return (
    // The font variables go on <html>, not <body>. `--font-sans` and
    // `--font-heading` are declared in @theme, which lands on :root — if the
    // faces are only defined from <body> down, every one of those references
    // is invalid at :root and font-family falls back to the browser default.
    // That is the whole app silently rendering in Times.
    // `data-brand` picks the palette. Remove the attribute and the whole app
    // returns to cream — the cream declarations in globals.css were never
    // edited, so there is nothing to restore. See the navy section there, and
    // the frozen values in lib/theme/cream.ts.
    <html
      lang="en"
      data-brand="navy"
      className={`${archivo.variable} ${plexArabic.variable} ${amiriQuran.variable} ${geistMono.variable} h-full${darkOnly ? " dark" : ""}`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          forcedTheme={darkOnly ? "dark" : undefined}
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
