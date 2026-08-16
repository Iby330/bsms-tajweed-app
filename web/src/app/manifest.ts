import type { MetadataRoute } from "next";

/**
 * Web app manifest — what Android and Chrome use when someone installs the
 * site to a home screen.
 *
 * `theme_color` is the brand ink rather than the page cream: it paints the
 * system UI around an installed window, and the rail is near-black in both
 * themes, so ink is the colour the app actually reads as.
 *
 * The `maskable` icon is a separate file, not a duplicate. Android crops
 * install icons to whatever shape the launcher uses — circle, squircle,
 * teardrop — so that one carries extra padding to keep the mark clear of the
 * crop. Serving the standard icon as maskable is what produces those app
 * icons with the logo sliced off at the edges.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BSMS Tajweed",
    short_name: "BSMS Tajweed",
    description:
      "Tajweed and Qur'an memorisation for the Brighton Sussex Muslim Students programme.",
    start_url: "/",
    display: "standalone",
    background_color: "#14140f",
    theme_color: "#14140f",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
