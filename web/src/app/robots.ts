import type { MetadataRoute } from "next";

/**
 * The landing page and the application form are the only pages meant to be
 * found. Everything else is behind a sign-in, and a crawler following a link
 * there indexes the login screen under the lesson's name.
 *
 * `/` itself is not allowed: it only redirects into the app or to /login. The asset folders stay open because a crawler that cannot
 * fetch the CSS, fonts or the share image renders a broken page and a link
 * preview with no picture.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/landing", "/apply", "/_next/", "/brand/", "/fonts/", "/testimonials/"],
      disallow: "/",
    },
  };
}
