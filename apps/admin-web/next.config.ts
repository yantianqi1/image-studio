import type { NextConfig } from "next";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:7800";

const adminRedirects = [
  { source: "/", destination: "/admin" },
  { source: "/login", destination: "/admin/login" },
  { source: "/users", destination: "/admin/users" },
  { source: "/billing", destination: "/admin/billing" },
  { source: "/redeem", destination: "/admin/redeem" },
  { source: "/providers", destination: "/admin/providers" },
  { source: "/image-jobs", destination: "/admin/image-jobs" },
  { source: "/image-tasks", destination: "/admin/image-tasks" },
  { source: "/comic-jobs", destination: "/admin/comic-jobs" },
  { source: "/comic-tasks", destination: "/admin/comic-tasks" },
  { source: "/settings", destination: "/admin/settings" },
] as const;

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "storage.googleapis.com" },
    ],
  },
  transpilePackages: ["@commercial-studio/ui"],
  async redirects() {
    return adminRedirects.map((item) => ({
      ...item,
      permanent: false,
    }));
  },
  async rewrites() {
    return [
      {
        source: "/api/admin/:path*",
        destination: `${API_BASE_URL}/api/admin/:path*`,
      },
    ];
  },
};

export default nextConfig;
