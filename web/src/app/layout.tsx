import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Sans_Arabic, Amiri_Quran, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";

// No `weight`: that pins the download to fixed cuts, and the 2026 design
// runs from 200 (display figures, the masthead) to 700 (emphasis). Omitting
// it ships the variable axis, so every weight in between actually renders
// instead of silently snapping to the nearest cut that was downloaded.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
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

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "BSMS Tajweed", template: "%s · BSMS Tajweed" },
  description:
    "Tajweed and Qur'an memorisation platform for the Brighton Sussex Muslim Students programme.",
};

/**
 * The browser chrome around the page — the address bar on mobile, the title
 * bar of an installed window. Two values so it follows the theme rather than
 * leaving a pale strip above a dark page.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f1df" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a08" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The font variables go on <html>, not <body>. `--font-sans` and
    // `--font-heading` are declared in @theme, which lands on :root — if the
    // faces are only defined from <body> down, every one of those references
    // is invalid at :root and font-family falls back to the browser default.
    // That is the whole app silently rendering in Times.
    <html
      lang="en"
      className={`${archivo.variable} ${plexArabic.variable} ${amiriQuran.variable} ${geistMono.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
