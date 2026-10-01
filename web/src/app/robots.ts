import type { MetadataRoute } from "next";

/**
 * The landing page and the application form are the only pages meant to be
 * found. Everything else is behind a sign-in, and a crawler following a link
 * there indexes the login screen under the lesson's name.
 *
 * `/$` is the front page alone: `Allow: /` would match every path and outrank
 * the disallow. The asset folders stay open because a crawler that cannot
 * fetch the CSS, fonts or the share image renders a broken page and a link
 * preview with no picture.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/$", "/apply", "/_next/", "/brand/", "/fonts/", "/testimonials/"],
      disallow: "/",
    },
  };
}
