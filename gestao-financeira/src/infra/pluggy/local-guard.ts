/**
 * Restringe rotas Pluggy ao app local (127.0.0.1 / localhost).
 */

const APP_ORIGIN_OK = new Set([
  "http://127.0.0.1:43127",
  "http://localhost:43127",
]);

export function assertLocalPluggyRequest(req: Request): boolean {
  const host = req.headers.get("host") || "";
  const origin = req.headers.get("origin") || "";
  if (origin && !APP_ORIGIN_OK.has(origin)) return false;
  return (
    host.startsWith("127.0.0.1:") ||
    host.startsWith("localhost:") ||
    host === "127.0.0.1" ||
    host === "localhost"
  );
}

export function parseBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = /^Bearer\s+(\S+)/i.exec(h.trim());
  return m?.[1] ?? null;
}
