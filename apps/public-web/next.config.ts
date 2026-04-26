import type { NextConfig } from "next";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:7800";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  devIndicators: false,
  transpilePackages: ["@commercial-studio/ui"],
  async rewrites() {
    return [
      {
        source: "/api/public/:path*",
        destination: `${API_BASE_URL}/api/public/:path*`,
      },
    ];
  },
};

export default nextConfig;
