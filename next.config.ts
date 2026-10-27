import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/roms",
  images: {
    unoptimized: true,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async redirects() {
    return [
      {
        source: "/",
        destination: "/roms",
        basePath: false,
        permanent: false,
      },
      {
        source: "/api/:path*",
        destination: "/roms/api/:path*",
        basePath: false,
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/api/ps2-play/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
          { key: "Access-Control-Allow-Origin", value: "*" },
        ],
      },
    ];
  },
};

export default nextConfig;
