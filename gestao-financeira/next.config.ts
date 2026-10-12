import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * CSP alinhada ao app local:
 * - sem frame (clickjacking)
 * - connect só self + runtime IA em 127.0.0.1
 * - sem object/base arbitrário
 * - WebLLM CDN NÃO liberado (inferência principal é runtime local)
 * - Browser NÃO fala com api.pluggy.ai (proxy server-side em /api/pluggy/*)
 *
 * Em desenvolvimento, Turbopack/Next exigem 'unsafe-eval' para HMR.
 * Em produção NÃO liberamos 'unsafe-eval'.
 *
 * TODO(TM-03/CSP): migrar script-src para nonces e remover 'unsafe-inline'
 * quando o pipeline Next permitir sem quebrar o standalone local.
 */
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  scriptSrc,
  "worker-src 'self' blob:",
  "connect-src 'self' http://127.0.0.1:43128 http://localhost:43128",
  "frame-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
        ],
      },
    ];
  },
};

export default nextConfig;
