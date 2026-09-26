import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Repeated isolated QA servers must not share a persistent Turbopack cache.
  experimental: {
    turbopackFileSystemCacheForDev:
      process.env.APORIA_TEST_NO_DEV_CACHE !== "1",
  },
  allowedDevOrigins: ["terminal.local"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
