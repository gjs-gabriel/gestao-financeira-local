/**
 * Orquestração client-side: chama o proxy local e aplica o merge no VaultSnapshot.
 * Credenciais Pluggy nunca passam por aqui.
 */

import type { PluggyFetchBundle } from "@/infra/pluggy/types";
import {
  mergePluggyFetchBundle,
  resolvePluggyItemIds,
  shouldSkipPluggySync,
  type PluggySyncResult,
  type VaultSnapshot,
} from "@/domain";
import {
  getPluggyProxyToken,
  setPluggyProxyToken,
  takePluggyProxyToken,
} from "@/security/vault-session";

async function mintPluggyProxyToken(itemIds: string[]): Promise<string> {
  const res = await fetch("/api/pluggy/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemIds }),
    cache: "no-store",
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      body &&
      typeof body === "object" &&
      "message" in body &&
      typeof (body as { message: unknown }).message === "string"
        ? (body as { message: string }).message
        : `Falha ao criar sessão Pluggy (${res.status})`;
    throw new Error(msg);
  }
  const token =
    body &&
    typeof body === "object" &&
    "token" in body &&
    typeof (body as { token: unknown }).token === "string"
      ? (body as { token: string }).token
      : null;
  if (!token) {
    throw new Error("Resposta de sessão Pluggy sem token.");
  }
  setPluggyProxyToken(token);
  return token;
}

/** Garante token de proxy com allowlist = itemIds do cofre. */
export async function ensurePluggyProxySession(
  itemIds: string[],
): Promise<string | null> {
  const unique = [...new Set(itemIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return null;
  return mintPluggyProxyToken(unique);
}

/** Revoga token no servidor (best-effort) e limpa memória. */
export async function revokePluggyProxySessionClient(
  tokenOverride?: string | null,
): Promise<void> {
  const token =
    tokenOverride !== undefined ? tokenOverride : takePluggyProxyToken();
  if (!token) {
    setPluggyProxyToken(null);
    return;
  }
  try {
    await fetch("/api/pluggy/session", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    /* ignore — lock local não depende do servidor */
  }
  setPluggyProxyToken(null);
}

export async function fetchPluggyBundleFromProxy(
  itemIds: string[],
): Promise<PluggyFetchBundle> {
  let token = getPluggyProxyToken();
  if (!token) {
    token = await mintPluggyProxyToken(itemIds);
  }

  const doFetch = (bearer: string) =>
    fetch("/api/pluggy/fetch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearer}`,
      },
      body: JSON.stringify({ itemIds }),
      cache: "no-store",
    });

  let res = await doFetch(token);
  if (res.status === 401) {
    token = await mintPluggyProxyToken(itemIds);
    res = await doFetch(token);
  }

  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      body &&
      typeof body === "object" &&
      "message" in body &&
      typeof (body as { message: unknown }).message === "string"
        ? (body as { message: string }).message
        : `Falha ao buscar Pluggy (${res.status})`;
    throw new Error(msg);
  }
  return body as PluggyFetchBundle;
}

export async function syncPluggyIntoSnapshot(
  snapshot: VaultSnapshot,
  opts?: { force?: boolean; itemIds?: string[] },
): Promise<PluggySyncResult> {
  const itemIds = resolvePluggyItemIds(snapshot, opts?.itemIds);
  if (itemIds.length === 0) {
    throw new Error(
      "Nenhum itemId Pluggy configurado. Cole os IDs do Dashboard e salve.",
    );
  }

  const last = shouldSkipPluggySync(snapshot, Boolean(opts?.force));
  if (last) {
    return {
      skipped: true,
      reason: "ttl",
      lastSyncedAt: last,
      snapshot,
    };
  }

  await ensurePluggyProxySession(itemIds);
  const bundle = await fetchPluggyBundleFromProxy(itemIds);
  const next = mergePluggyFetchBundle(snapshot, bundle, itemIds);
  return {
    skipped: false,
    snapshot: next,
    fetchedAt: bundle.fetchedAt,
  };
}
