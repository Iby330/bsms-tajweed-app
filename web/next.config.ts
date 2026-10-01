import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // saveAvatar accepts up to 2 MB, and the default 1 MB cap refused
      // everything between before the action ran — with a framework error,
      // not the sentence the action has for it. The headroom is multipart
      // overhead.
      bodySizeLimit: "3mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Nothing here is meant to be framed, and a framed sign-in or
          // marking page is a clickjacking target. Both forms: the CSP
          // directive is the standard, X-Frame-Options covers older browsers.
          // Only `frame-ancestors` — a script or style policy would break the
          // inline styles and scripts the app and next-themes rely on.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // No Permissions-Policy: voice notes need the microphone.
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: "/hifz", destination: "/hifdh", permanent: true },
      { source: "/hifz/:path*", destination: "/hifdh/:path*", permanent: true },
      { source: "/teacher/hifz", destination: "/teacher/hifdh", permanent: true },
      { source: "/teacher/hifz/:path*", destination: "/teacher/hifdh/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
