import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-pg",
  ],
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          // OPTIONS preflight — echoed per-request in the route handlers
          // These static headers handle non-credentialed GETs (e.g. health checks)
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, POST, PUT, DELETE, OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization, Cookie",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
