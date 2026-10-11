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

export async function fetchPluggyBundleFromProxy(
  itemIds: string[],
): Promise<PluggyFetchBundle> {
  const res = await fetch("/api/pluggy/fetch", {
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

  const bundle = await fetchPluggyBundleFromProxy(itemIds);
  const next = mergePluggyFetchBundle(snapshot, bundle, itemIds);
  return {
    skipped: false,
    snapshot: next,
    fetchedAt: bundle.fetchedAt,
  };
}
