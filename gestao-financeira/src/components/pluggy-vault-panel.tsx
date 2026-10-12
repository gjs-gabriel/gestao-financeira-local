"use client";

import { useEffect, useState } from "react";
import { useVault } from "@/lib/vault-context";
import { OpenFinanceConnect } from "@/components/open-finance-connect";
import { PluggyIntegrationSection } from "@/components/pluggy-integration-section";
import {
  PluggySimpleLog,
  PluggySyncLog,
} from "@/components/pluggy-sync-log";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  pluggyErrorReport,
  updatePluggyItemIds,
  type PluggySyncReport,
} from "@/domain";
import {
  consumePluggyWebhookInbox,
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
  const { snapshot, updateSnapshot, activeProfile, error, clearError } =
    useVault();
  const [itemIdsText, setItemIdsText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgTone, setMsgTone] = useState<"ok" | "info" | "warn" | "error">(
    "info",
  );
  const [report, setReport] = useState<PluggySyncReport | null>(null);

  useEffect(() => {
    setItemIdsText((snapshot?.openFinance?.itemIds ?? []).join("\n"));
  }, [snapshot?.openFinance?.itemIds]);

  // Poll leve da inbox de webhooks → sync forçado dos itemIds afetados.
  useEffect(() => {
    if (!snapshot) return;
    const ids = snapshot.openFinance?.itemIds ?? [];
    if (ids.length === 0) return;
    let cancelled = false;

    async function drainInbox() {
      try {
        const { pendingItemIds } = await consumePluggyWebhookInbox(ids);
        if (cancelled || pendingItemIds.length === 0) return;
        const overlap = pendingItemIds.filter((id) => ids.includes(id));
        const toSync = overlap.length > 0 ? overlap : pendingItemIds;
        setBusy(true);
        setMsg(null);
        setReport(null);
        const result = await syncPluggyIntoSnapshot(snapshot, {
          force: true,
          itemIds: toSync,
        });
        if (cancelled) return;
        if (!result.skipped) {
          await updateSnapshot(() => result.snapshot);
          setReport({
            ...result.report,
            lines: [
              {
                level: "ok",
                text: `Webhook: ${toSync.length} conexão(ões) re-sincronizada(s).`,
              },
              ...result.report.lines,
            ],
          });
        }
      } catch {
        /* ignore — sync manual continua disponível */
      } finally {
        if (!cancelled) setBusy(false);
      }
    }

    void drainInbox();
    const timer = window.setInterval(() => void drainInbox(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [snapshot, updateSnapshot]);

  if (!snapshot) return null;

  async function saveItemIds() {
    setBusy(true);
    setMsg(null);
    setReport(null);
    clearError();
    try {
      const ids = parseItemIdsText(itemIdsText);
      await updateSnapshot((prev) => updatePluggyItemIds(prev, ids));
      if (ids.length === 0) {
        await revokePluggyProxySessionClient();
      } else {
        await ensurePluggyProxySession(ids);
      }
      setMsgTone("ok");
      setMsg(
        ids.length === 0
          ? "ItemIds Pluggy removidos do cofre."
          : `${ids.length} itemId(s) salvos no .gfin.`,
      );
    } catch (e) {
      setMsgTone("error");
      setMsg(e instanceof Error ? e.message : "Falha ao salvar itemIds");
    } finally {
      setBusy(false);
    }
  }

  async function syncNow(force: boolean) {
    setBusy(true);
    setMsg(null);
    setReport(null);
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
        setMsgTone("warn");
        setMsg(
          `Sync Pluggy adiado (TTL 24h). Última sync: ${result.lastSyncedAt}. Use “Sincronizar agora” para forçar.`,
        );
        return;
      }
      await updateSnapshot(() => result.snapshot);
      setReport(result.report);
    } catch (e) {
      setReport(
        pluggyErrorReport(
          e instanceof Error ? e.message : "Falha na sincronização Pluggy",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function onItemConnected(itemId: string) {
    setBusy(true);
    setMsg(null);
    setReport(null);
    clearError();
    try {
      const nextIds = [
        ...new Set([...parseItemIdsText(itemIdsText), itemId]),
      ];
      setItemIdsText(nextIds.join("\n"));
      const withIds = updatePluggyItemIds(snapshot, nextIds);
      await ensurePluggyProxySession(nextIds);
      const result = await syncPluggyIntoSnapshot(withIds, {
        force: true,
        itemIds: nextIds,
      });
      if (result.skipped) {
        await updateSnapshot(() => withIds);
        setMsgTone("warn");
        setMsg(
          `Banco conectado (${itemId}). Sync adiado por TTL — use “Sincronizar agora”.`,
        );
        return;
      }
      await updateSnapshot(() => result.snapshot);
      setReport({
        ...result.report,
        lines: [
          {
            level: "ok",
            text: `Banco conectado. itemId ${itemId} salvo no cofre.`,
          },
          ...result.report.lines,
        ],
      });
    } catch (e) {
      setReport(
        pluggyErrorReport(
          e instanceof Error
            ? e.message
            : "Conexão ok, mas falhou ao salvar/sincronizar o itemId",
        ),
      );
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
        connectSlot={
          <OpenFinanceConnect
            clientUserId={activeProfile?.id}
            includeSandbox
            disabled={busy}
            onItemConnected={(id) => void onItemConnected(id)}
            onError={(message) => {
              setReport(null);
              setMsgTone("error");
              setMsg(message);
            }}
          />
        }
      />
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Erro</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {report && <PluggySyncLog report={report} />}
      {!report && msg && (
        <PluggySimpleLog message={msg} tone={msgTone} />
      )}
    </div>
  );
}
