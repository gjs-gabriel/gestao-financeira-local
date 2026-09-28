import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build standalone para o launcher empacotar sem `npm run dev`
  output: "standalone",
  // WebLLM / WebGPU: isolamento para SharedArrayBuffer quando suportado
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
        ],
      },
    ];
  },
};

export default nextConfig;
