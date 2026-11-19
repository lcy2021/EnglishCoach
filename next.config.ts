import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "jsdom"],
  devIndicators: false,
};

export default nextConfig;
