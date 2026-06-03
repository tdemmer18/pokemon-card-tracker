import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.63"],
  outputFileTracingIncludes: {
    "/api/expansions": ["./data/expansions.json"],
    "/api/expansion-cards": ["./data/cards/**"],
    "/api/scan-search": ["./data/cards/**"],
    "/api/scan-match": ["./data/card-hashes.json"],
    "/api/scan-embed": ["./data/card-embeddings.bin", "./data/card-embeddings.meta.json"],
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
