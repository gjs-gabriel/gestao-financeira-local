/**
 * Gate in-memory do proxy Pluggy — token opaco + allowlist de itemIds.
 * Só processo Node; nunca persiste em disco.
 */

import { SESSION_IDLE_MS_DEFAULT } from "./limits";
import { timingSafeEqualString } from "./timing-safe";

export type PluggyProxySession = {
  allowedItemIds: string[];
  expiresAt: number;
  createdAt: number;
};

const sessions = new Map<string, PluggyProxySession>();

/** Janelas de rate limit por token (timestamps de requests). */
const rateBuckets = new Map<string, number[]>();

export const PLUGGY_PROXY_RATE_LIMIT = 30;
export const PLUGGY_PROXY_RATE_WINDOW_MS = 60_000;

function normalizeIds(ids: string[]): string[] {
  return [
    ...new Set(
      ids
        .filter((id): id is string => typeof id === "string")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

export function mintPluggyProxySession(
  itemIds: string[],
  ttlMs = SESSION_IDLE_MS_DEFAULT,
  now = Date.now(),
): { token: string; expiresAt: number; allowedItemIds: string[] } {
  const allowedItemIds = normalizeIds(itemIds);
  if (allowedItemIds.length === 0) {
    throw new Error("item_ids_required");
  }
  const token = randomToken();
  const expiresAt = now + Math.max(60_000, ttlMs);
  sessions.set(token, {
    allowedItemIds,
    expiresAt,
    createdAt: now,
  });
  return { token, expiresAt, allowedItemIds };
}

export function revokePluggyProxySession(token: string | null | undefined): void {
  if (!token) return;
  sessions.delete(token);
  rateBuckets.delete(token);
}

export function getPluggyProxySession(
  token: string,
  now = Date.now(),
): PluggyProxySession | null {
  const s = sessions.get(token);
  if (!s) return null;
  if (s.expiresAt <= now) {
    sessions.delete(token);
    rateBuckets.delete(token);
    return null;
  }
  return s;
}

export type AssertPluggyFetchResult =
  | { ok: true; allowedItemIds: string[]; itemIds: string[] }
  | { ok: false; status: number; error: string; message: string };

/**
 * Valida Bearer + subset de itemIds + rate limit.
 * `envFallbackIds` só entram se já estiverem na allowlist da sessão.
 */
export function assertPluggyFetchAccess(
  token: string | null,
  requestedIds: string[],
  opts?: { envFallbackIds?: string[]; now?: number },
): AssertPluggyFetchResult {
  const now = opts?.now ?? Date.now();
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "unauthorized",
      message: "Token de sessão Pluggy ausente.",
    };
  }

  const session = getPluggyProxySession(token, now);
  if (!session) {
    return {
      ok: false,
      status: 401,
      error: "unauthorized",
      message: "Sessão Pluggy inválida ou expirada.",
    };
  }

  if (!checkRateLimit(token, now)) {
    return {
      ok: false,
      status: 429,
      error: "rate_limited",
      message: "Muitas requisições Pluggy. Aguarde um momento.",
    };
  }

  const allow = new Set(session.allowedItemIds);
  let requested = normalizeIds(requestedIds);
  if (requested.length === 0 && opts?.envFallbackIds?.length) {
    requested = normalizeIds(opts.envFallbackIds).filter((id) => allow.has(id));
  }

  if (requested.length === 0) {
    return {
      ok: false,
      status: 400,
      error: "item_ids_missing",
      message: "Informe itemIds permitidos pela sessão do cofre.",
    };
  }

  const denied = requested.filter((id) => !allow.has(id));
  if (denied.length > 0) {
    return {
      ok: false,
      status: 403,
      error: "item_id_forbidden",
      message: "Um ou mais itemIds não pertencem à sessão do cofre.",
    };
  }

  return { ok: true, allowedItemIds: session.allowedItemIds, itemIds: requested };
}

function checkRateLimit(token: string, now: number): boolean {
  const windowStart = now - PLUGGY_PROXY_RATE_WINDOW_MS;
  const prev = rateBuckets.get(token) ?? [];
  const recent = prev.filter((t) => t >= windowStart);
  if (recent.length >= PLUGGY_PROXY_RATE_LIMIT) {
    rateBuckets.set(token, recent);
    return false;
  }
  recent.push(now);
  rateBuckets.set(token, recent);
  return true;
}

/** Comparação estável de token (evita vazamento por timing em revoke seletivo). */
export function tokensMatch(a: string, b: string): boolean {
  return timingSafeEqualString(a, b);
}

/** Testes */
export function __clearPluggyProxySessionsForTests(): void {
  sessions.clear();
  rateBuckets.clear();
}

export function __pluggyProxySessionsForTests(): Map<string, PluggyProxySession> {
  return sessions;
}
