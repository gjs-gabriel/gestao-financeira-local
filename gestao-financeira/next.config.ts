import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * CSP alinhada ao app local:
 * - sem frame-ancestors (clickjacking: nosso app não é embutido)
 * - connect: self + runtime IA + Pluggy Connect (widget no browser)
 * - frame-src: só connect.pluggy.ai (widget Open Finance)
 * - dados financeiros via proxy /api/pluggy/*; o widget precisa falar com Pluggy
 * - WebLLM CDN NÃO liberado (inferência principal é runtime local)
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

/**
 * Domínios do widget Pluggy Connect (Zoid iframe + API + OAuth + CDN).
 * Sem isso o modal fica no spinner infinito.
 */
const PLUGGY_FRAME =
  "https://connect.pluggy.ai https://connect.pluggy.dev https://cdn.pluggy.ai";
const PLUGGY_CONNECT = [
  "https://api.pluggy.ai",
  "https://api.pluggy.dev",
  "https://connect.pluggy.ai",
  "https://connect.pluggy.dev",
  "https://cdn.pluggy.ai",
  "wss://connect.pluggy.ai",
  "wss://connect.pluggy.dev",
].join(" ");
const PLUGGY_IMG = "https://cdn.pluggy.ai https://*.pluggy.ai data: blob:";

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self' https://connect.pluggy.ai https://api.pluggy.ai",
  `img-src 'self' data: blob: ${PLUGGY_IMG}`,
  "font-src 'self' data: https://cdn.pluggy.ai https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://cdn.pluggy.ai https://fonts.googleapis.com",
  scriptSrc,
  "worker-src 'self' blob:",
  `connect-src 'self' http://127.0.0.1:43128 http://localhost:43128 ${PLUGGY_CONNECT}`,
  `frame-src 'self' ${PLUGGY_FRAME} https://*.pluggy.ai`,
  `child-src 'self' ${PLUGGY_FRAME} https://*.pluggy.ai`,
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // same-origin quebra popup OAuth dos bancos; allow-popups libera o fluxo Pluggy.
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
          // COEP (mesmo credentialless) impede o iframe Zoid do Pluggy Connect.
          // Não enviamos COEP — o app local não depende de SharedArrayBuffer.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // no-referrer pode atrapalhar o handshake do widget; origem basta.
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
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
