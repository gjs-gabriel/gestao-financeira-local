"use client";

import { useEffect, useState } from "react";
import { useVault } from "@/lib/vault-context";
import { PluggyIntegrationSection } from "@/components/pluggy-integration-section";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { updatePluggyItemIds } from "@/domain";
import {
  ensurePluggyProxySession,
  revokePluggyProxySessionClient,
  syncPluggyIntoSnapshot,
} from "@/lib/pluggy-client-sync";

function parseItemIdsText(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[,;\n\r\t]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

/** Open Finance / Pluggy — vive em Importar, não no Cofre. */
export function PluggyVaultPanel() {
  const { snapshot, updateSnapshot, error, clearError } = useVault();
  const [itemIdsText, setItemIdsText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setItemIdsText((snapshot?.openFinance?.itemIds ?? []).join("\n"));
  }, [snapshot?.openFinance?.itemIds]);

  if (!snapshot) return null;

  async function saveItemIds() {
    setBusy(true);
    setMsg(null);
    clearError();
    try {
      const ids = parseItemIdsText(itemIdsText);
      await updateSnapshot((prev) => updatePluggyItemIds(prev, ids));
      if (ids.length === 0) {
        await revokePluggyProxySessionClient();
      } else {
        await ensurePluggyProxySession(ids);
      }
      setMsg(
        ids.length === 0
          ? "ItemIds Pluggy removidos do cofre."
          : `${ids.length} itemId(s) salvos no .gfin.`,
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao salvar itemIds");
    } finally {
      setBusy(false);
    }
  }

  async function syncNow(force: boolean) {
    setBusy(true);
    setMsg(null);
    clearError();
    try {
      const ids = parseItemIdsText(itemIdsText);
      const base =
        ids.length > 0 ? updatePluggyItemIds(snapshot, ids) : snapshot;
      const result = await syncPluggyIntoSnapshot(base, {
        force,
        itemIds: ids.length > 0 ? ids : undefined,
      });
      if (result.skipped) {
        if (ids.length > 0) {
          await updateSnapshot(() => base);
        }
        setMsg(
          `Sync Pluggy adiado (TTL 24h). Última sync: ${result.lastSyncedAt}. Use “Sincronizar agora” para forçar.`,
        );
        return;
      }
      await updateSnapshot(() => result.snapshot);
      setMsg(
        `Pluggy sincronizado em ${result.fetchedAt}. Contas, extratos e investimentos atualizados.`,
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha na sincronização Pluggy");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <PluggyIntegrationSection
        itemIdsText={itemIdsText}
        onItemIdsChange={setItemIdsText}
        lastSyncedAt={snapshot.openFinance?.lastSyncedAt}
        busy={busy}
        onSaveItemIds={() => void saveItemIds()}
        onSyncNow={() => void syncNow(true)}
      />
      {(msg || error) && (
        <Alert variant={error ? "destructive" : "default"}>
          <AlertTitle>{error ? "Erro" : "Open Finance"}</AlertTitle>
          <AlertDescription>{error ?? msg}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
