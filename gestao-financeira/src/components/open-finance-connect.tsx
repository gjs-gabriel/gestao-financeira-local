"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PluggyConnect } from "react-pluggy-connect";
import { Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface OpenFinanceConnectProps {
  /** clientUserId opcional enviado ao backend / Pluggy. */
  clientUserId?: string;
  /** Se definido, o widget atualiza essa conexão em vez de criar outra. */
  updateItemId?: string;
  /** Inclui conectores Sandbox / MeuPluggy (dev). */
  includeSandbox?: boolean;
  disabled?: boolean;
  onItemConnected: (itemId: string) => void | Promise<void>;
  onError?: (message: string) => void;
}

type ConnectTokenResponse = {
  accessToken?: string;
  error?: string;
  message?: string;
};

const WIDGET_LOAD_TIMEOUT_MS = 20_000;

/**
 * Abre o Pluggy Connect após buscar um Connect Token no proxy local.
 * Credenciais CLIENT_ID/SECRET ficam só no servidor (PLUGGY_CLIENT_*).
 */
export function OpenFinanceConnect({
  clientUserId,
  updateItemId,
  includeSandbox = true,
  disabled,
  onItemConnected,
  onError,
}: OpenFinanceConnectProps) {
  const [open, setOpen] = useState(false);
  const [connectToken, setConnectToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [widgetReady, setWidgetReady] = useState(false);
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLoadTimer = useCallback(() => {
    if (loadTimerRef.current) {
      clearTimeout(loadTimerRef.current);
      loadTimerRef.current = null;
    }
  }, []);

  const reportError = useCallback(
    (message: string) => {
      setLocalError(message);
      onError?.(message);
    },
    [onError],
  );

  function closeWidget() {
    clearLoadTimer();
    setOpen(false);
    setConnectToken(null);
    setWidgetReady(false);
  }

  useEffect(() => () => clearLoadTimer(), [clearLoadTimer]);

  async function openWidget() {
    setLocalError(null);
    setLoading(true);
    setConnectToken(null);
    setWidgetReady(false);
    clearLoadTimer();
    try {
      const res = await fetch("/api/pluggy/connect-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(clientUserId ? { clientUserId } : {}),
          ...(updateItemId ? { itemId: updateItemId } : {}),
        }),
        cache: "no-store",
      });
      const data = (await res.json().catch(() => null)) as ConnectTokenResponse | null;
      if (!res.ok || !data?.accessToken) {
        throw new Error(
          data?.message ||
            data?.error ||
            `Falha ao obter Connect Token (${res.status})`,
        );
      }
      setConnectToken(data.accessToken);
      setOpen(true);
      loadTimerRef.current = setTimeout(() => {
        reportError(
          "O widget Pluggy não respondeu a tempo. Pare o Next (Ctrl+C), suba de novo (npm run dev) para recarregar a CSP, e tente outra vez. Se persistir, abra F12 → Console e veja erros de frame/CSP.",
        );
        closeWidget();
      }, WIDGET_LOAD_TIMEOUT_MS);
    } catch (e) {
      reportError(
        e instanceof Error ? e.message : "Não foi possível abrir o Pluggy Connect",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          className="gap-1.5"
          disabled={disabled || loading || open}
          onClick={() => void openWidget()}
        >
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Link2 className="size-3.5" />
          )}
          {updateItemId ? "Atualizar conexão" : "Conectar banco (Pluggy)"}
        </Button>
        {open ? (
          <Button type="button" variant="ghost" size="sm" onClick={closeWidget}>
            Fechar widget
          </Button>
        ) : null}
      </div>

      {localError ? (
        <p className="text-xs text-destructive" role="alert">
          {localError}
        </p>
      ) : null}

      <p className="text-xs text-muted-foreground">
        O widget abre o fluxo oficial do Open Finance (banco + consentimento).
        Depois da conexão, o <code className="text-[11px]">itemId</code> é
        salvo neste cofre automaticamente. Após mudar a CSP, é preciso{" "}
        <strong className="font-medium text-foreground/80">reiniciar o servidor</strong>
        {" "}(F5 não basta).
      </p>

      {open && connectToken ? (
        <div className="min-h-[568px] overflow-visible rounded-lg border border-border/60 bg-background">
          {!widgetReady ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Carregando Pluggy Connect…
            </p>
          ) : null}
          <PluggyConnect
            connectToken={connectToken}
            includeSandbox={includeSandbox}
            language="pt"
            {...(updateItemId ? { updateItem: updateItemId } : {})}
            onClose={closeWidget}
            onLoadError={(error) => {
              clearLoadTimer();
              reportError(
                error?.message ||
                  "Widget Pluggy não carregou. Reinicie o servidor Next para aplicar a CSP.",
              );
              closeWidget();
            }}
            onEvent={(payload) => {
              // Qualquer evento do widget indica que o iframe respondeu.
              if (!widgetReady) {
                setWidgetReady(true);
                clearLoadTimer();
              }
              void payload;
            }}
            onSuccess={(itemData) => {
              clearLoadTimer();
              const id = itemData?.item?.id;
              if (typeof id === "string" && id.trim()) {
                void Promise.resolve(onItemConnected(id.trim())).finally(
                  closeWidget,
                );
              } else {
                reportError("Conexão ok, mas o itemId não veio no retorno.");
                closeWidget();
              }
            }}
            onError={(error) => {
              clearLoadTimer();
              reportError(error?.message || "Falha na conexão Pluggy");
              closeWidget();
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
