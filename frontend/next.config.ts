import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allows a production build alongside a running dev server (NEXT_DIST_DIR=.next-build).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
};

export default nextConfig;
