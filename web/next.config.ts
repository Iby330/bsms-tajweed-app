import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
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
