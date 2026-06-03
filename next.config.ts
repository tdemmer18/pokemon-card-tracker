import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.63"],
  outputFileTracingIncludes: {
    "/api/expansions": ["./data/expansions.json"],
    "/api/expansion-cards": ["./data/cards/**"],
    "/api/scan-search": ["./data/cards/**"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "assets.pokemon.com",
      },
      {
        protocol: "https",
        hostname: "images.pokemontcg.io",
      },
      {
        protocol: "https",
        hostname: "images.scrydex.com",
      },
    ],
  },
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
