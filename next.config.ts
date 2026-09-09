import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["terminal.local"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
